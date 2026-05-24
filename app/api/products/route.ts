// src/app/api/products/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        inventories: {
          include: {
            warehouse: {
              select: { id: true, name: true, location: true },
            },
          },
        },
      },
    });

    const shaped = products.map((product) => ({
      id:          product.id,
      name:        product.name,
      description: product.description,
      price:       product.price,
      imageUrl:    product.imageUrl,
      // One entry per warehouse that stocks this product
      stock: product.inventories.map((inv) => ({
        warehouseId:   inv.warehouse.id,
        warehouseName: inv.warehouse.name,
        location:      inv.warehouse.location,
        total:         inv.totalUnits,
        reserved:      inv.reservedUnits,
        available:     inv.totalUnits - inv.reservedUnits, // key derived field
      })),
    }));

    return NextResponse.json({ products: shaped }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}