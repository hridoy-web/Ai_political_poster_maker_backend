import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from .env");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });

const connectDB = async (): Promise<void> => {
  await prisma.$connect();
  console.log("PostgreSQL connected successfully.");
};

export default connectDB;
