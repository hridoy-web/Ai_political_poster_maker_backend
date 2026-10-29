import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { initSSLCommerzPayment, validateSSLCommerzPayment } from './sslcommerz.adapter.js';

export const initiatePaymentSession = async (
    userId: string,
    data: { packageId?: string; customAmount?: number; paymentMethod?: string; customerPhone?: string }
) => {
    let amount = 0;
    let packageId: string | null = null;

    if (data.packageId) {
        const pkg = await prisma.package.findFirst({
            where: {
                OR: [
                    { id: data.packageId },
                    { code: data.packageId },
                ],
            },
        });

        if (pkg) {
            amount = Number(pkg.price);
            packageId = pkg.id;
        } else if (data.customAmount) {
            if (data.customAmount < 20) throw new ApiError(400, 'Minimum recharge amount is 20 BDT');
            amount = data.customAmount;
        } else {
            throw new ApiError(404, 'Selected package not found');
        }
    } else if (data.customAmount) {
        if (data.customAmount < 20) throw new ApiError(400, 'Minimum recharge amount is 20 BDT');
        amount = data.customAmount;
    } else {
        throw new ApiError(400, 'Either packageId or customAmount is required');
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
    });

    const tranId = `TRAN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await prisma.payment.create({
        data: {
            userId,
            packageId,
            customerPhone: data.customerPhone || null,
            amount,
            currency: 'BDT',
            provider: 'SSLCOMMERZ',
            tranId,
            idempotencyKey: tranId,
            status: 'PENDING',
        },
    });

    const backendUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');

    const sslRes = await initSSLCommerzPayment({
        total_amount: amount,
        tran_id: tranId,
        success_url: `${backendUrl}/api/v1/payments/sslcommerz/success`,
        fail_url: `${backendUrl}/api/v1/payments/sslcommerz/fail`,
        cancel_url: `${backendUrl}/api/v1/payments/sslcommerz/cancel`,
        ipn_url: `${backendUrl}/api/v1/payments/webhook/sslcommerz`,
        cus_name: user?.name || 'PosterAI User',
        cus_email: user?.email || 'user@posterai.com',
        cus_phone: data.customerPhone || '01700000000',
        paymentMethod: data.paymentMethod,
    });

    if (!sslRes?.GatewayPageURL) {
        throw new ApiError(500, 'Failed to initiate payment session with SSLCommerz');
    }

    let targetUrl = sslRes.GatewayPageURL;

    // Direct Sandbox Simulator Routing:
    // If the user selected a direct channel like bKash or Nagad, route directly to its
    // sandbox OTP/PIN simulator from sslRes.desc instead of the generic multi-tab EasyCheckOut page.
    if (data.paymentMethod && Array.isArray(sslRes.desc)) {
        const method = data.paymentMethod.toLowerCase().trim();
        // If user selected a direct wallet (like bKash or Nagad), route directly to its sandbox simulator.
        // For 'card' / 'cards', GatewayPageURL provides the full choice of Visa, Mastercard, DBBL Nexus, etc.
        if (method !== 'card' && method !== 'cards') {
            const matchedGw = sslRes.desc.find(
                (item: any) =>
                    item.gw?.toLowerCase() === method ||
                    item.name?.toLowerCase() === method ||
                    item.gw?.toLowerCase().includes(method) ||
                    item.name?.toLowerCase().includes(method)
            );

            if (matchedGw?.redirectGatewayURL) {
                targetUrl = matchedGw.redirectGatewayURL;
            }
        }
    }

    return { GatewayPageURL: targetUrl, tranId };
};

export const verifyAndFulfillPayment = async (valId: string, tranId: string) => {
    // 1. Webhook Deduplication check
    const existingWebhook = await prisma.paymentWebhookEvent.findUnique({
        where: {
            provider_providerEventId: {
                provider: 'SSLCOMMERZ',
                providerEventId: valId || tranId,
            },
        },
    });

    if (existingWebhook && existingWebhook.status === 'PROCESSED') {
        const existingPayment = await prisma.payment.findUnique({ where: { tranId } });
        return existingPayment;
    }

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

        // Amount & Currency Verification
        if (Number(payment.amount) !== Number(validationRes.currency_amount)) {
            throw new ApiError(400, 'Transaction amount discrepancy detected');
        }

        // Extract customer phone and gateway transaction ID from validationRes with priority hierarchy
        const isCleanPhone = (val?: string | null): val is string =>
            Boolean(val && /^01[3-9]\d{8}$/.test(val.trim()));

        const customerPhone =
            (isCleanPhone(validationRes.cus_phone) ? validationRes.cus_phone.trim() : null) ||
            (isCleanPhone(payment.customerPhone) ? payment.customerPhone.trim() : null) ||
            (isCleanPhone(validationRes.card_no) ? validationRes.card_no.trim() : null) ||
            validationRes.cus_phone ||
            payment.customerPhone ||
            null;
        const bankTranId = validationRes.bank_tran_id || null;

        const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
                status: 'SUCCEEDED',
                verifiedAt: new Date(),
                providerReference: valId,
                valId,
                customerPhone: customerPhone ? String(customerPhone).trim() : null,
                bankTranId: bankTranId ? String(bankTranId).trim() : null,
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

        // CreditLedgerEntry (Immutable Audit Record)
        await tx.creditLedgerEntry.create({
            data: {
                userId: payment.userId,
                type: payment.packageId ? 'PACKAGE_CREDIT' : 'GRANT',
                amount: creditsToGrant,
                balanceAfter: creditWallet.balance,
                idempotencyKey: `LEDGER_PAYMENT_${payment.id}`,
            },
        });

        // Money Wallet (Money Balance) & Ledger Entry
        const moneyWallet = await tx.wallet.upsert({
            where: { userId: payment.userId },
            create: { userId: payment.userId, balance: payment.amount, currency: 'BDT' },
            update: { balance: { increment: payment.amount } },
        });

        await tx.moneyLedgerEntry.create({
            data: {
                userId: payment.userId,
                type: 'RECHARGE',
                amount: payment.amount,
                currency: 'BDT',
                balanceAfter: moneyWallet.balance,
                idempotencyKey: `LEDGER_MONEY_${payment.id}`,
            },
        });

        // Record Webhook Event as PROCESSED
        const payloadHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(validationRes))
            .digest('hex');

        await tx.paymentWebhookEvent.upsert({
            where: {
                provider_providerEventId: {
                    provider: 'SSLCOMMERZ',
                    providerEventId: valId || tranId,
                },
            },
            create: {
                paymentId: payment.id,
                provider: 'SSLCOMMERZ',
                providerEventId: valId || tranId,
                signatureValid: true,
                payloadHash,
                status: 'PROCESSED',
                processedAt: new Date(),
            },
            update: {
                status: 'PROCESSED',
                processedAt: new Date(),
            },
        });

        return updatedPayment;
    });
};

export const handlePaymentFailureInDB = async (tranId: string, status: 'FAILED' | 'CANCELLED') => {
    if (!tranId) return null;
    return await prisma.payment.updateMany({
        where: { tranId, status: 'PENDING' },
        data: { status },
    });
};