import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import {
    initSSLCommerzPayment,
    validateSSLCommerzPayment,
    validateSSLCommerzByTranId,
} from './sslcommerz.adapter.js';

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
        console.error('[SSLCommerz Session Init Error]', sslRes);
        throw new ApiError(500, `Failed to initiate payment session with SSLCommerz: ${sslRes?.failedreason || 'Gateway unreachable'}`);
    }

    let targetUrl = sslRes.GatewayPageURL;

    // Direct Sandbox Simulator Routing:
    if (data.paymentMethod && Array.isArray(sslRes.desc)) {
        const method = data.paymentMethod.toLowerCase().trim();
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

export const verifyAndFulfillPayment = async (valId?: string, tranId?: string) => {
    if (!tranId && !valId) {
        throw new ApiError(400, 'Both tran_id and val_id are missing from payment verification request');
    }

    // 1. Fast-path idempotency: If payment is ALREADY marked SUCCEEDED in DB, return immediately
    if (tranId) {
        const existingPayment = await prisma.payment.findUnique({
            where: { tranId },
            include: { package: true },
        });

        if (existingPayment && existingPayment.status === 'SUCCEEDED') {
            return existingPayment;
        }
    }

    // 2. Webhook Event Deduplication check
    const eventId = valId || tranId;
    if (eventId) {
        const existingWebhook = await prisma.paymentWebhookEvent.findUnique({
            where: {
                provider_providerEventId: {
                    provider: 'SSLCOMMERZ',
                    providerEventId: eventId,
                },
            },
        });

        if (existingWebhook && existingWebhook.status === 'PROCESSED' && tranId) {
            const existingPayment = await prisma.payment.findUnique({ where: { tranId } });
            if (existingPayment?.status === 'SUCCEEDED') {
                return existingPayment;
            }
        }
    }

    // 3. Call SSLCommerz Validation API (val_id primary, tran_id fallback)
    let validationRes: any = null;

    if (valId && valId.trim()) {
        try {
            validationRes = await validateSSLCommerzPayment(valId.trim());
        } catch (err: any) {
            console.warn(`[SSLCommerz] val_id verification error: ${err?.message}, checking tran_id fallback...`);
        }
    }

    if ((!validationRes || (validationRes.status !== 'VALID' && validationRes.status !== 'VALIDATED')) && tranId) {
        try {
            const tranValidation = await validateSSLCommerzByTranId(tranId.trim());
            if (tranValidation?.element && Array.isArray(tranValidation.element) && tranValidation.element.length > 0) {
                const matched = tranValidation.element.find((el: any) => el.tran_id === tranId) || tranValidation.element[0];
                if (matched && (matched.status === 'VALID' || matched.status === 'VALIDATED')) {
                    validationRes = matched;
                    if (!valId && matched.val_id) {
                        valId = matched.val_id;
                    }
                }
            }
        } catch (err: any) {
            console.error('[SSLCommerz] merchantTransID verification error:', err?.message || err);
        }
    }

    if (!validationRes || (validationRes.status !== 'VALID' && validationRes.status !== 'VALIDATED')) {
        console.error('[SSLCommerz Validation Failed]', { valId, tranId, validationRes });
        throw new ApiError(400, `Payment validation failed on SSLCommerz server: ${validationRes?.status || 'INVALID_TRANSACTION'}`);
    }

    const effectiveTranId = tranId || validationRes.tran_id;
    if (!effectiveTranId) {
        throw new ApiError(400, 'Cannot fulfill payment: transaction ID could not be resolved');
    }

    // 4. Atomic Database Updates via prisma.$transaction
    return await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
            where: { tranId: effectiveTranId },
            include: { package: true },
        });

        if (!payment) throw new ApiError(404, `Payment record not found for tranId: ${effectiveTranId}`);
        if (payment.status === 'SUCCEEDED') return payment; // Idempotent guard inside transaction

        // Amount & Currency Verification with floating point tolerance
        const verifiedAmount = Number(validationRes.currency_amount || validationRes.amount || 0);
        if (verifiedAmount > 0 && Math.abs(Number(payment.amount) - verifiedAmount) > 0.01) {
            throw new ApiError(400, `Transaction amount discrepancy: expected ${payment.amount}, received ${verifiedAmount}`);
        }

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
        const effectiveValId = valId || validationRes.val_id || effectiveTranId;

        const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
                status: 'SUCCEEDED',
                verifiedAt: new Date(),
                providerReference: effectiveValId,
                valId: effectiveValId,
                customerPhone: customerPhone ? String(customerPhone).trim().slice(0, 50) : null,
                bankTranId: bankTranId ? String(bankTranId).trim().slice(0, 100) : null,
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

        // Increment Credit Wallet atomically
        const creditWallet = await tx.creditWallet.upsert({
            where: { userId: payment.userId },
            create: { userId: payment.userId, balance: creditsToGrant },
            update: { balance: { increment: creditsToGrant } },
        });

        // CreditLedgerEntry with unique idempotency protection
        await tx.creditLedgerEntry.upsert({
            where: {
                userId_idempotencyKey: {
                    userId: payment.userId,
                    idempotencyKey: `LEDGER_PAYMENT_${payment.id}`,
                },
            },
            create: {
                userId: payment.userId,
                type: payment.packageId ? 'PACKAGE_CREDIT' : 'GRANT',
                amount: creditsToGrant,
                balanceAfter: creditWallet.balance,
                idempotencyKey: `LEDGER_PAYMENT_${payment.id}`,
            },
            update: {
                balanceAfter: creditWallet.balance,
            },
        });

        // Increment Money Wallet (Balance) and Ledger Entry
        const moneyWallet = await tx.wallet.upsert({
            where: { userId: payment.userId },
            create: { userId: payment.userId, balance: payment.amount, currency: 'BDT' },
            update: { balance: { increment: payment.amount } },
        });

        await tx.moneyLedgerEntry.upsert({
            where: {
                userId_idempotencyKey: {
                    userId: payment.userId,
                    idempotencyKey: `LEDGER_MONEY_${payment.id}`,
                },
            },
            create: {
                userId: payment.userId,
                type: 'RECHARGE',
                amount: payment.amount,
                currency: 'BDT',
                balanceAfter: moneyWallet.balance,
                idempotencyKey: `LEDGER_MONEY_${payment.id}`,
            },
            update: {
                balanceAfter: moneyWallet.balance,
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
                    providerEventId: effectiveValId,
                },
            },
            create: {
                paymentId: payment.id,
                provider: 'SSLCOMMERZ',
                providerEventId: effectiveValId,
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
