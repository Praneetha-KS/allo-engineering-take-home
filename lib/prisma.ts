// src/lib/prisma.ts
//
// Next.js reloads modules in development on every hot-reload.
// Without this singleton pattern, each reload would create a brand-new
// PrismaClient, quickly exhausting your Postgres connection pool.
// In production there is only one module instance, so the global trick
// has no effect there — it's purely a dev-mode safety net.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}