import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Purchases a package by deducting the price from the user's money wallet.
 * Atomically grants poster credits and creates a subscription.
 */
export const purchasePackageWithWallet = async (
  userId: string,
  packageId: string
): Promise<{ subscription: object; creditsGranted: number; newMoneyBalance: number; newCreditBalance: number }> => {
  // 1. Find the package
  const pkg = await prisma.package.findFirst({
    where: {
      OR: [{ id: packageId }, { code: packageId }],
    },
  });

  if (!pkg) throw new ApiError(404, 'Selected package not found');

  const packagePrice = Number(pkg.price);

  return await prisma.$transaction(async (tx) => {
    // 2. Lock the money wallet and check balance
    const moneyWallet = await tx.wallet.findUnique({ where: { userId } });
    const currentBalance = Number(moneyWallet?.balance ?? 0);

    if (currentBalance < packagePrice) {
      throw new ApiError(
        400,
        `Insufficient wallet balance. Required: ৳${packagePrice.toFixed(2)}, Available: ৳${currentBalance.toFixed(2)}`
      );
    }

    // 3. Deduct money from wallet
    const updatedMoneyWallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: packagePrice } },
    });

    // Guard against concurrent overdraft
    if (Number(updatedMoneyWallet.balance) < 0) {
      throw new ApiError(400, 'Insufficient wallet balance (concurrent overdraft prevented)');
    }

    // 4. Record money ledger debit entry
    const idempotencyBase = `WALLET_PKG_${userId}_${pkg.id}_${Date.now()}`;
    await tx.moneyLedgerEntry.create({
      data: {
        userId,
        type: 'ADJUSTMENT',
        amount: -packagePrice,
        currency: 'BDT',
        balanceAfter: updatedMoneyWallet.balance,
        idempotencyKey: `${idempotencyBase}_MONEY`,
      },
    });

    // 5. Grant poster credits
    const creditsToGrant = pkg.posterCredits + pkg.bonusCredits;
    const updatedCreditWallet = await tx.creditWallet.upsert({
      where: { userId },
      create: { userId, balance: creditsToGrant },
      update: { balance: { increment: creditsToGrant } },
    });

    await tx.creditLedgerEntry.create({
      data: {
        userId,
        type: 'PACKAGE_CREDIT',
        amount: creditsToGrant,
        balanceAfter: updatedCreditWallet.balance,
        idempotencyKey: `${idempotencyBase}_CREDIT`,
      },
    });

    // 6. Create subscription
    const startsAt = new Date();
    const endsAt = pkg.durationDays
      ? new Date(startsAt.getTime() + pkg.durationDays * 86_400_000)
      : null;

    const subscription = await tx.subscription.create({
      data: {
        userId,
        packageId: pkg.id,
        status: 'ACTIVE',
        startsAt,
        endsAt,
        packageCodeAtPurchase: pkg.code,
        packageNameAtPurchase: pkg.name,
        packageVersionAtPurchase: pkg.version,
        priceAtPurchase: pkg.price,
        currencyAtPurchase: pkg.currency,
        durationDaysAtPurchase: pkg.durationDays,
        posterCreditsAtPurchase: pkg.posterCredits,
        bonusCreditsAtPurchase: pkg.bonusCredits,
        aiCaptionLimitAtPurchase: pkg.aiCaptionLimit,
        aiBackgroundLimitAtPurchase: pkg.aiBackgroundLimit,
        premiumAccessAtPurchase: pkg.premiumAccess,
      },
    });

    return {
      subscription,
      creditsGranted: creditsToGrant,
      newMoneyBalance: Number(updatedMoneyWallet.balance),
      newCreditBalance: updatedCreditWallet.balance,
    };
  });
};
