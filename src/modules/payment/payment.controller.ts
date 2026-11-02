import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import {
    initiatePaymentSession,
    verifyAndFulfillPayment,
    handlePaymentFailureInDB,
} from './payment.service.js';
import sendResponse from '../../utils/sendResponse.js';

const getFrontendUrl = () => (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const initiatePayment = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized: please login to initiate payment');
    }
    const result = await initiatePaymentSession(userId, req.body);
    return sendResponse(res, 200, 'Payment initiated successfully', true, null, result);
});

export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
    const provider = req.params.provider || 'SSLCOMMERZ';
    const val_id = (req.body?.val_id || req.body?.valId || req.query?.val_id || req.query?.valId) as string | undefined;
    const tran_id = (req.body?.tran_id || req.body?.tranId || req.query?.tran_id || req.query?.tranId) as string | undefined;

    if (!val_id && !tran_id) {
        return sendResponse(res, 400, 'Invalid webhook payload: val_id or tran_id is required', false, null, null);
    }

    try {
        const result = await verifyAndFulfillPayment(val_id, tran_id);
        return sendResponse(res, 200, `${provider} webhook processed successfully`, true, null, result);
    } catch (err: any) {
        console.error('[SSLCommerz IPN Webhook Error]:', err?.message || err);
        return sendResponse(res, 400, `Webhook fulfillment error: ${err?.message || 'Processing failed'}`, false, null, null);
    }
});

export const handleSuccessRedirect = asyncHandler(async (req: Request, res: Response) => {
    const val_id = (req.body?.val_id || req.body?.valId || req.query?.val_id || req.query?.valId) as string | undefined;
    const tran_id = (req.body?.tran_id || req.body?.tranId || req.query?.tran_id || req.query?.tranId) as string | undefined;
    const frontendUrl = getFrontendUrl();

    try {
        if (!val_id && !tran_id) {
            console.error('Missing val_id and tran_id in SSLCommerz success redirect:', { body: req.body, query: req.query });
            const failUrl = process.env.PAYMENT_FAIL_REDIRECT_URL || `${frontendUrl}/recharge?status=failed&error=missing_transaction_id`;
            return res.redirect(failUrl);
        }

        await verifyAndFulfillPayment(val_id, tran_id);
        const successUrl = process.env.PAYMENT_SUCCESS_REDIRECT_URL || `${frontendUrl}/recharge?status=success&tran_id=${tran_id || ''}`;
        return res.redirect(successUrl);
    } catch (error: any) {
        console.error('[Payment Error] Payment fulfillment failed in handleSuccessRedirect:', error?.message || error);
        const failUrl = process.env.PAYMENT_FAIL_REDIRECT_URL || `${frontendUrl}/recharge?status=failed&tran_id=${tran_id || ''}`;
        return res.redirect(failUrl);
    }
});

export const handleFailRedirect = asyncHandler(async (req: Request, res: Response) => {
    const tran_id = (req.body?.tran_id || req.body?.tranId || req.query?.tran_id || req.query?.tranId) as string | undefined;
    if (tran_id) {
        await handlePaymentFailureInDB(tran_id, 'FAILED');
    }
    const frontendUrl = getFrontendUrl();
    const failUrl = process.env.PAYMENT_FAIL_REDIRECT_URL || `${frontendUrl}/recharge?status=failed&tran_id=${tran_id || ''}`;
    return res.redirect(failUrl);
});

export const handleCancelRedirect = asyncHandler(async (req: Request, res: Response) => {
    const tran_id = (req.body?.tran_id || req.body?.tranId || req.query?.tran_id || req.query?.tranId) as string | undefined;
    if (tran_id) {
        await handlePaymentFailureInDB(tran_id, 'CANCELLED');
    }
    const frontendUrl = getFrontendUrl();
    const cancelUrl = process.env.PAYMENT_CANCEL_REDIRECT_URL || `${frontendUrl}/recharge?status=cancelled&tran_id=${tran_id || ''}`;
    return res.redirect(cancelUrl);
});
