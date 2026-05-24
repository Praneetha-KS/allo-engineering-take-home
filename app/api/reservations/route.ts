// src/app/api/reservations/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma"; // your shared Prisma client singleton

// ─────────────────────────────────────────────────────────────
// How long a reservation stays alive (milliseconds)
// ─────────────────────────────────────────────────────────────
const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─────────────────────────────────────────────────────────────
// Request body validation with Zod
// ─────────────────────────────────────────────────────────────
const ReserveSchema = z.object({
  productId:   z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity:    z.number().int().positive().default(1),
});

// ─────────────────────────────────────────────────────────────
// POST /api/reservations
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {

  // ── 0. Parse & validate the request body ──────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parsed = ReserveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;

  // ── 1. Idempotency (bonus) ─────────────────────────────────
  // If the client sends an Idempotency-Key header, we return the
  // cached response for any retry rather than creating a second
  // reservation.
  const idempotencyKey = request.headers.get("Idempotency-Key");

  if (idempotencyKey) {
    const cached = await prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });

    if (cached) {
      // Key already used → replay original response
      return NextResponse.json(cached.responseBody, {
        status: cached.statusCode,
        headers: { "X-Idempotent-Replay": "true" },
      });
    }
  }

  // ── 2. Core logic inside a Prisma interactive transaction ──
  //
  // WHY A TRANSACTION WITH SELECT FOR UPDATE?
  //
  // Without a lock, this race condition is possible:
  //   Request A reads inventory → 1 unit available ✓
  //   Request B reads inventory → 1 unit available ✓  (same snapshot!)
  //   Request A writes reservedUnits + 1 → 1 reserved
  //   Request B writes reservedUnits + 1 → 2 reserved  ← BUG: oversold!
  //
  // SELECT FOR UPDATE acquires an exclusive row-level lock the moment
  // the SELECT runs.  Any second transaction that tries to lock the
  // same row is forced to WAIT until the first transaction commits or
  // rolls back.  Postgres serialises them for us:
  //   Request A locks row, checks stock (1 ≥ 1) ✓, writes, commits, releases lock
  //   Request B now gets the lock, checks stock (0 < 1) ✗, returns 409
  //
  // The lock is released automatically at the end of the transaction.

  try {
    const result = await prisma.$transaction(
      async (tx) => {

      // 2a. Lock the exact inventory row for this product/warehouse.
      //     $queryRaw is required because Prisma's ORM API doesn't yet
      //     expose SELECT … FOR UPDATE directly.
      const rows = await tx.$queryRaw<
        Array<{
          id:             string;
          totalUnits:     number;
          reservedUnits:  number;
        }>
      >`
        SELECT id, "totalUnits", "reservedUnits"
        FROM   inventories
        WHERE  "productId"   = ${productId}
          AND  "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;
      // ↑ FOR UPDATE: this line is the entire concurrency guarantee.
      //   No second transaction can read this row until we're done.

      if (rows.length === 0) {
        // No inventory record → treat as zero stock
        throw new StockError(
          "No inventory found for this product/warehouse combination",
          404
        );
      }

      const inventory = rows[0];
      const available = inventory.totalUnits - inventory.reservedUnits;

      if (available < quantity) {
        // Not enough stock → 409 Conflict
        throw new StockError(
          `Not enough stock. Requested: ${quantity}, available: ${available}`,
          409
        );
      }

      // 2b. Increment reservedUnits (still inside the same transaction
      //     so the lock is still held).
      await tx.inventory.update({
        where: { id: inventory.id },
        data:  { reservedUnits: { increment: quantity } },
      });

      // 2c. Create the reservation record.
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

      const reservation = await tx.reservation.create({
        data: {
          inventoryId:   inventory.id,
          quantity,
          status:        "pending",
          expiresAt,
          idempotencyKey: idempotencyKey ?? undefined,
        },
        // Return useful fields to the client
        select: {
          id:         true,
          quantity:   true,
          status:     true,
          expiresAt:  true,
          createdAt:  true,
          inventory: {
            select: {
              product:   { select: { id: true, name: true, price: true } },
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      });

      return reservation;
      // ↑ Committing the transaction here releases the FOR UPDATE lock.
    
  },
  {
    timeout: 10000,
    maxWait: 10000,
  }
);
    // ── 3. Build the success response ─────────────────────────
    const responseBody = {
      reservation: result,
      message: "Reservation created. Complete payment before expiry.",
    };

    // Cache for idempotency replay if key was supplied
    if (idempotencyKey) {
      await prisma.idempotencyRecord.create({
        data: {
          key:          idempotencyKey,
          responseBody: responseBody as object,
          statusCode:   201,
          expiresAt:    new Date(Date.now() + RESERVATION_TTL_MS + 60_000),
          // Keep cache slightly longer than the reservation itself
        },
      });
    }

    return NextResponse.json(responseBody, { status: 201 });

  } catch (err) {

    // ── 4. Known stock / validation errors ────────────────────
    if (err instanceof StockError) {

      const errorBody = { error: err.message };

      // Cache 409 responses too — a retry on the same key should
      // get the same 409 back, not accidentally create a reservation.
      if (idempotencyKey && err.statusCode === 409) {
        await prisma.idempotencyRecord.create({
          data: {
            key:          idempotencyKey,
            responseBody: errorBody as object,
            statusCode:   409,
            expiresAt:    new Date(Date.now() + RESERVATION_TTL_MS),
          },
        }).catch(() => {
          // Best-effort — don't let an idempotency write failure
          // change the response the client receives.
        });
      }

      return NextResponse.json(errorBody, { status: err.statusCode });
    }

    // ── 5. Unexpected errors ───────────────────────────────────
    console.error("[POST /api/reservations] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Small typed error class so we can distinguish "expected"
// business-logic failures from real exceptions in the catch block.
// ─────────────────────────────────────────────────────────────
class StockError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "StockError";
  }
}