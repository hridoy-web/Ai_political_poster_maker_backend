import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  pgPool?: pg.Pool;
};

// Hot-reload-এ ডুপ্লিকেট কানেকশন পুল এড়াতে গ্লোবাল পুলে pg.Pool সংরক্ষণ
const pool = globalForPrisma.pgPool ?? new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // টার্মিনালে বারবার ব্যাকগ্রাউন্ড কুয়েরি লগ হওয়া বন্ধ করতে 'query' বাদ দেওয়া হয়েছে
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

export default prisma;