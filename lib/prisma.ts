import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Use the pooled DATABASE_URL for normal queries (pgbouncer handles pooling)
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Graceful shutdown: disconnect Prisma when the process exits
// Prevents connection leak on hot-reload in development
if (typeof process !== "undefined") {
  const shutdown = async () => {
    await prisma.$disconnect();
  };
  process.on("beforeExit", shutdown);
  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });
}
