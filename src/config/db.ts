import { PrismaClient } from "@prisma/client/extension";

const prisma = new PrismaClient();

const connectDB = async (): Promise<void> => {
    try {
        await prisma.$connect();
        console.log(`PostgreSQL Database Connected Successfully via Prisma!`);
        
    } catch (error: any) {
        console.error(`Database connection error: ${error.message}`);
    }
};

export default connectDB;
