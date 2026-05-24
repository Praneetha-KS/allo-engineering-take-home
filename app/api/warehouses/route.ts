// src/app/api/warehouses/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
      include: {
        inventories: {
          select: {
            totalUnits:    true,
            reservedUnits: true,
          },
        },
      },
    });

    const shaped = warehouses.map((wh) => ({
      id:           wh.id,
      name:         wh.name,
      location:     wh.location,
      productCount: wh.inventories.length,
      totalUnits:   wh.inventories.reduce((sum, i) => sum + i.totalUnits, 0),
      totalAvailable: wh.inventories.reduce(
        (sum, i) => sum + (i.totalUnits - i.reservedUnits),
        0
      ),
    }));

    return NextResponse.json({ warehouses: shaped }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/warehouses]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}