import { prisma } from "../../lib/prisma.js";
import { BillingService } from "../payment/billing.service.js";

export const getWalletBalanceFromDB = async (userId: string) => {
  return await BillingService.getEntitlements(userId);
};

export const getWalletTransactionsFromDB = async (
  userId: string,
  page: number = 1,
  limit: number = 20
) => {
  const skip = (page - 1) * limit;

  const [creditEntries, totalCreditEntries, moneyEntries, totalMoneyEntries] =
    await Promise.all([
      prisma.creditLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.creditLedgerEntry.count({ where: { userId } }),
      prisma.moneyLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.moneyLedgerEntry.count({ where: { userId } }),
    ]);

  return {
    creditLedger: {
      data: creditEntries,
      pagination: {
        page,
        limit,
        total: totalCreditEntries,
        totalPages: Math.ceil(totalCreditEntries / limit),
      },
    },
    moneyLedger: {
      data: moneyEntries,
      pagination: {
        page,
        limit,
        total: totalMoneyEntries,
        totalPages: Math.ceil(totalMoneyEntries / limit),
      },
    },
  };
};
