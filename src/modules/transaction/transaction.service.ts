import { prisma } from "../../lib/prisma.js";

export const getMyTransactionHistoryFromDB = async (
  userId: string,
  page: number = 1,
  limit: number = 20
) => {
  const skip = (page - 1) * limit;

  const [payments, totalPayments, creditEntries, totalCreditEntries] =
    await Promise.all([
      prisma.payment.findMany({
        where: { userId },
        include: { package: { select: { name: true, code: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where: { userId } }),
      prisma.creditLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.creditLedgerEntry.count({ where: { userId } }),
    ]);

  return {
    payments: {
      data: payments,
      pagination: {
        page,
        limit,
        total: totalPayments,
        totalPages: Math.ceil(totalPayments / limit),
      },
    },
    credits: {
      data: creditEntries,
      pagination: {
        page,
        limit,
        total: totalCreditEntries,
        totalPages: Math.ceil(totalCreditEntries / limit),
      },
    },
  };
};
