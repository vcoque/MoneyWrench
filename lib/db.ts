import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot reloads in dev so we don't
// exhaust the Postgres connection pool every time Next.js recompiles a
// module that imports this file. In production each server process just
// creates one instance normally.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
