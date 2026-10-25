import { PrismaClient } from '@prisma/client';
import { ApiError } from '../../utils/ApiError.js';
import { initSSLCommerzPayment, validateSSLCommerzPayment } from './sslcommerz.adapter.js';

const prisma = new PrismaClient();

export const initiatePaymentSession = async (
    userId: string,
    data: { packageId?: string; customAmount?: number }
) => {
    let amount = 0;
    let packageId: string | null = null;

    if (data.packageId) {
        const pkg = await prisma.package.findUnique({ where: { id: data.packageId } });
        if (!pkg) throw new ApiError(404, 'Selected package not found');
        amount = Number(pkg.price);
        packageId = pkg.id;
    } else if (data.customAmount) {
        if (data.customAmount < 20) throw new ApiError(400, 'Minimum recharge amount is 20 BDT');
        amount = data.customAmount;
    } else {
        throw new ApiError(400, 'Either packageId or customAmount is required');
    }

    const tranId = `TRAN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await prisma.payment.create({
        data: {
            userId,
            packageId,
            amount,
            currency: 'BDT',
            provider: 'SSLCOMMERZ',
            tranId,
            idempotencyKey: tranId,
            status: 'PENDING',
        },
    });

    const sslRes = await initSSLCommerzPayment({
        total_amount: amount,
        tran_id: tranId,
        success_url: `${process.env.BACKEND_URL}/api/v1/payments/sslcommerz/success`,
        fail_url: `${process.env.BACKEND_URL}/api/v1/payments/sslcommerz/fail`,
        cancel_url: `${process.env.BACKEND_URL}/api/v1/payments/sslcommerz/cancel`,
        ipn_url: `${process.env.BACKEND_URL}/api/v1/payments/webhook/sslcommerz`,
        cus_name: 'PosterAI User',
        cus_email: 'user@posterai.com',
        cus_phone: '01700000000',
    });

    if (!sslRes?.GatewayPageURL) {
        throw new ApiError(500, 'Failed to initiate payment session with SSLCommerz');
    }

    return { GatewayPageURL: sslRes.GatewayPageURL, tranId };
};

export const verifyAndFulfillPayment = async (valId: string, tranId: string) => {
    const validationRes = await validateSSLCommerzPayment(valId);

    if (validationRes.status !== 'VALID' && validationRes.status !== 'VALIDATED') {
        throw new ApiError(400, 'Payment validation failed on SSLCommerz server');
    }

    return await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
            where: { tranId },
            include: { package: true },
        });

        if (!payment) throw new ApiError(404, 'Payment record not found');
        if (payment.status === 'SUCCEEDED') return payment; 

        if (Number(payment.amount) !== Number(validationRes.currency_amount)) {
            throw new ApiError(400, 'Transaction amount discrepancy detected');
        }

        const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
                status: 'SUCCEEDED',
                verifiedAt: new Date(),
                providerReference: valId,
            },
        });

        let creditsToGrant = 0;

        if (payment.package) {
            const pkg = payment.package;
            creditsToGrant = pkg.posterCredits + pkg.bonusCredits;

            const startsAt = new Date();
            const endsAt = pkg.durationDays
                ? new Date(startsAt.getTime() + pkg.durationDays * 86400000)
                : null;

            const subscription = await tx.subscription.create({
                data: {
                    userId: payment.userId,
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

            await tx.payment.update({
                where: { id: payment.id },
                data: { subscriptionId: subscription.id },
            });
        } else {
            creditsToGrant = Math.floor(Number(payment.amount));
        }

        const creditWallet = await tx.creditWallet.upsert({
            where: { userId: payment.userId },
            create: { userId: payment.userId, balance: creditsToGrant },
            update: { balance: { increment: creditsToGrant } },
        });

        // CreditLedgerEntry
        await tx.creditLedgerEntry.create({
            data: {
                userId: payment.userId,
                type: payment.packageId ? 'PACKAGE_CREDIT' : 'GRANT',
                amount: creditsToGrant,
                balanceAfter: creditWallet.balance,
                idempotencyKey: `LEDGER_PAYMENT_${payment.id}`,
            },
        });

        return updatedPayment;
    });
};