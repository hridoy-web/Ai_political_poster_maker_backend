import { prisma } from "../../lib/prisma.js";

export const getMyActiveSubscriptionFromDB = async (userId: string) => {
  const now = new Date();

  // Find active subscription
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { createdAt: "desc" },
  });

  return subscription;
};

export const getMySubscriptionHistoryFromDB = async (userId: string) => {
  return await prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};
