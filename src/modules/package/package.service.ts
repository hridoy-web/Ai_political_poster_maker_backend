import { PrismaClient } from '@prisma/client';
import { ApiError } from '../../utils/ApiError.js';

const prisma = new PrismaClient();

export const getPublishedPackagesFromDB = async () => {
  const now = new Date();
  return await prisma.package.findMany({
    where: {
      isPublished: true,
      OR: [
        { effectiveFrom: null, effectiveUntil: null },
        { effectiveFrom: { lte: now }, effectiveUntil: { gte: now } },
      ],
    },
    orderBy: { price: 'asc' },
  });
};

export const createPackageInDB = async (payload: any) => {
  const existingPackage = await prisma.package.findUnique({
    where: { code: payload.code },
  });

  if (existingPackage) {
    throw new ApiError(400, 'Package code already exists');
  }

  return await prisma.package.create({ data: payload });
};