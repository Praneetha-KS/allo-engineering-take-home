// src/app/api/reservations/[id]/release/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const result = await prisma.$transaction(async (tx) => {

      // 1. Lock the reservation row
      const rows = await tx.$queryRaw<
        Array<{
          id:          string;
          status:      string;
          quantity:    number;
          inventoryId: string;
        }>
      >`
        SELECT id, status, quantity, "inventoryId"
        FROM   reservations
        WHERE  id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw new ReservationError("Reservation not found", 404);
      }

      const reservation = rows[0];

      // 2. Idempotent: already released → return success with a note
      if (reservation.status === "released") {
        return {
          alreadyReleased: true,
          reservation: await tx.reservation.findUnique({
            where:  { id },
            select: { id: true, quantity: true, status: true, updatedAt: true },
          }),
        };
      }

      // 3. Guard: cannot release a confirmed reservation
      if (reservation.status === "confirmed") {
        throw new ReservationError(
          "Cannot release a confirmed reservation. Use the refund/return flow instead.",
          409
        );
      }

      // 4. Mark as released
      const updated = await tx.reservation.update({
        where: { id },
        data:  { status: "released" },
        select: {
          id:        true,
          quantity:  true,
          status:    true,
          expiresAt: true,
          updatedAt: true,
        },
      });

      // 5. Free the held units back into available stock
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data:  { reservedUnits: { decrement: reservation.quantity } },
      });

      return { alreadyReleased: false, reservation: updated };
    });

    // Build response message depending on whether it was a no-op
    const message = result.alreadyReleased
      ? "Reservation was already released — no changes made"
      : "Reservation released. Stock has been returned to available inventory";

    return NextResponse.json(
      { reservation: result.reservation, message },
      { status: 200 }
    );

  } catch (err) {
    if (err instanceof ReservationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error(`[POST /api/reservations/${id}/release]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Typed error for business-logic failures
class ReservationError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ReservationError";
  }
}