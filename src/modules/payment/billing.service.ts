import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import type { CreditEntryType } from "@prisma/client";

export interface UserEntitlements {
  credits: number;
  moneyBalance: number;
  hasActiveSubscription: boolean;
  subscription: {
    id: string;
    packageCode: string;
    packageName: string;
    startsAt: Date | null;
    endsAt: Date | null;
    posterCredits: number;
    bonusCredits: number;
    aiCaptionLimit: number;
    aiBackgroundLimit: number;
    premiumAccess: boolean;
  } | null;
  features: {
    premiumAccess: boolean;
    aiCaptionLimit: number;
    aiBackgroundLimit: number;
  };
}

/**
 * Core Billing Service Contract for AI Political Poster Maker.
 * Used internally by Dev 5 (Poster Generation), Dev 6 (AI Workers), and Dev 7 (Billing/Wallet).
 */
export class BillingService {
  /**
   * Retrieves user entitlements: credit wallet balance, money balance, and active subscription.
   * Automatically handles expiration of subscriptions if endsAt is in the past.
   */
  static async getEntitlements(userId: string): Promise<UserEntitlements> {
    const now = new Date();

    // 1. Fetch or create CreditWallet and Money Wallet in parallel
    const [creditWallet, moneyWallet] = await Promise.all([
      prisma.creditWallet.upsert({
        where: { userId },
        create: { userId, balance: 0 },
        update: {},
      }),
      prisma.wallet.upsert({
        where: { userId },
        create: { userId, balance: 0, currency: "BDT" },
        update: {},
      }),
    ]);

    // 2. Fetch active subscription
    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Auto-expire any stale subscriptions
    await prisma.subscription.updateMany({
      where: {
        userId,
        status: "ACTIVE",
        endsAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    return {
      credits: creditWallet.balance,
      moneyBalance: Number(moneyWallet.balance),
      hasActiveSubscription: !!activeSub,
      subscription: activeSub
        ? {
            id: activeSub.id,
            packageCode: activeSub.packageCodeAtPurchase,
            packageName: activeSub.packageNameAtPurchase,
            startsAt: activeSub.startsAt,
            endsAt: activeSub.endsAt,
            posterCredits: activeSub.posterCreditsAtPurchase,
            bonusCredits: activeSub.bonusCreditsAtPurchase,
            aiCaptionLimit: activeSub.aiCaptionLimitAtPurchase,
            aiBackgroundLimit: activeSub.aiBackgroundLimitAtPurchase,
            premiumAccess: activeSub.premiumAccessAtPurchase,
          }
        : null,
      features: {
        premiumAccess: activeSub?.premiumAccessAtPurchase ?? false,
        aiCaptionLimit: activeSub?.aiCaptionLimitAtPurchase ?? 0,
        aiBackgroundLimit: activeSub?.aiBackgroundLimitAtPurchase ?? 0,
      },
    };
  }

  /**
   * Reserves credits for an upcoming poster or AI operation.
   * Concurrency-safe: Prevents balance from dropping below 0 under concurrent load.
   * Idempotent: Same idempotencyKey will not charge twice.
   */
  static async reserveCredits(
    userId: string,
    amount: number,
    idempotencyKey: string
  ) {
    if (amount <= 0) {
      throw new ApiError(400, "Credit amount must be greater than zero.");
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      const existingEntry = await tx.creditLedgerEntry.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existingEntry) {
        return {
          idempotent: true,
          entry: existingEntry,
          balanceAfter: existingEntry.balanceAfter,
        };
      }

      // 2. Concurrency-Safe Balance Check
      const wallet = await tx.creditWallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < amount) {
        throw new ApiError(
          400,
          `Insufficient credits. Required: ${amount}, Available: ${wallet?.balance || 0}`
        );
      }

      // 3. Atomic Decrement
      const updatedWallet = await tx.creditWallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      if (updatedWallet.balance < 0) {
        throw new ApiError(400, "Insufficient credits (concurrent overdraft prevented).");
      }

      // 4. Immutable Ledger Entry
      const ledgerEntry = await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: "RESERVE",
          amount: -amount,
          balanceAfter: updatedWallet.balance,
          idempotencyKey,
        },
      });

      return {
        idempotent: false,
        entry: ledgerEntry,
        balanceAfter: updatedWallet.balance,
      };
    });
  }

  /**
   * Settles previously reserved or direct poster generation debit.
   * Idempotent: Same idempotencyKey will not settle twice.
   */
  static async settleCredits(
    userId: string,
    amount: number,
    idempotencyKey: string
  ) {
    if (amount <= 0) {
      throw new ApiError(400, "Credit amount must be greater than zero.");
    }

    return await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.creditLedgerEntry.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existingEntry) {
        return {
          idempotent: true,
          entry: existingEntry,
          balanceAfter: existingEntry.balanceAfter,
        };
      }

      const wallet = await tx.creditWallet.findUnique({ where: { userId } });
      const currentBalance = wallet ? wallet.balance : 0;

      // Settlement marks finality
      const ledgerEntry = await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: "SETTLE",
          amount: -amount,
          balanceAfter: currentBalance,
          idempotencyKey,
        },
      });

      return {
        idempotent: false,
        entry: ledgerEntry,
        balanceAfter: currentBalance,
      };
    });
  }

  /**
   * Refunds credits to a user (e.g. failed poster generation or AI timeout).
   * Idempotent: Prevents duplicate refund on retried jobs.
   */
  static async refundCredits(
    userId: string,
    amount: number,
    idempotencyKey: string
  ) {
    if (amount <= 0) {
      throw new ApiError(400, "Refund amount must be greater than zero.");
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      const existingEntry = await tx.creditLedgerEntry.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existingEntry) {
        return {
          idempotent: true,
          entry: existingEntry,
          balanceAfter: existingEntry.balanceAfter,
        };
      }

      // 2. Atomic Increment
      const updatedWallet = await tx.creditWallet.upsert({
        where: { userId },
        create: { userId, balance: amount },
        update: { balance: { increment: amount } },
      });

      // 3. Immutable Ledger Entry
      const ledgerEntry = await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: "REFUND",
          amount,
          balanceAfter: updatedWallet.balance,
          idempotencyKey,
        },
      });

      return {
        idempotent: false,
        entry: ledgerEntry,
        balanceAfter: updatedWallet.balance,
      };
    });
  }

  /**
   * Grants credits to a user (Admin gift, referral bonus, or purchase fulfillment).
   */
  static async grantCredits(
    userId: string,
    amount: number,
    idempotencyKey: string,
    source: CreditEntryType = "GRANT"
  ) {
    if (amount <= 0) {
      throw new ApiError(400, "Grant amount must be greater than zero.");
    }

    return await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.creditLedgerEntry.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existingEntry) {
        return {
          idempotent: true,
          entry: existingEntry,
          balanceAfter: existingEntry.balanceAfter,
        };
      }

      const updatedWallet = await tx.creditWallet.upsert({
        where: { userId },
        create: { userId, balance: amount },
        update: { balance: { increment: amount } },
      });

      const ledgerEntry = await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: source,
          amount,
          balanceAfter: updatedWallet.balance,
          idempotencyKey,
        },
      });

      return {
        idempotent: false,
        entry: ledgerEntry,
        balanceAfter: updatedWallet.balance,
      };
    });
  }
}
