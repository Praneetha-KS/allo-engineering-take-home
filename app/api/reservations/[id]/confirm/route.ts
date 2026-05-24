// src/app/api/reservations/[id]/confirm/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const confirmed = await prisma.$transaction(async (tx) => {

      // 1. Lock the reservation row
      const rows = await tx.$queryRaw<
        Array<{
          id:          string;
          status:      string;
          quantity:    number;
          expiresAt:   Date;
          inventoryId: string;
        }>
      >`
        SELECT id, status, quantity, "expiresAt", "inventoryId"
        FROM   reservations
        WHERE  id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw new ReservationError("Reservation not found", 404);
      }

      const reservation = rows[0];

      // 2. Guard: must be pending
      if (reservation.status !== "pending") {
        throw new ReservationError(
          `Reservation is already "${reservation.status}" and cannot be confirmed`,
          409
        );
      }

      // 3. Guard: must not be expired
      if (new Date() > new Date(reservation.expiresAt)) {
        
        await tx.reservation.update({
          where: { id },
          data:  { status: "released" },
        });
        // Also free the held units
        await tx.inventory.update({
          where: { id: reservation.inventoryId },
          data:  { reservedUnits: { decrement: reservation.quantity } },
        });

        throw new ReservationError(
          "Reservation has expired and cannot be confirmed",
          410 
        );
      }

      // 4. Confirm: update reservation status
      const updated = await tx.reservation.update({
        where: { id },
        data:  { status: "confirmed" },
        select: {
          id:        true,
          quantity:  true,
          status:    true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // 5. Permanently decrement stock.
      //    totalUnits goes down (sold), reservedUnits goes down (hold lifted).
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: {
          totalUnits:    { decrement: reservation.quantity },
          reservedUnits: { decrement: reservation.quantity },
        },
      });

      return updated;
    });

    return NextResponse.json(
      { reservation: confirmed, message: "Reservation confirmed successfully" },
      { status: 200 }
    );

  } catch (err) {
    if (err instanceof ReservationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error(`[POST /api/reservations/${id}/confirm]`, err);
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