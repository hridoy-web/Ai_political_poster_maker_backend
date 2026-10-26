import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import {
    initiatePaymentSession,
    verifyAndFulfillPayment,
    handlePaymentFailureInDB,
} from './payment.service.js';
import sendResponse from '../../utils/sendResponse.js';

const getFrontendUrl = () => process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';

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
    const val_id = req.body?.val_id || req.body?.valId || req.query?.val_id;
    const tran_id = req.body?.tran_id || req.body?.tranId || req.query?.tran_id;

    if (!val_id || !tran_id) {
        return sendResponse(res, 400, 'Invalid webhook payload: val_id and tran_id required', false, null, null);
    }

    const result = await verifyAndFulfillPayment(String(val_id), String(tran_id));
    return sendResponse(res, 200, `${provider} webhook processed successfully`, true, null, result);
});

export const handleSuccessRedirect = asyncHandler(async (req: Request, res: Response) => {
    const val_id = (req.body?.val_id || req.query?.val_id) as string;
    const tran_id = (req.body?.tran_id || req.query?.tran_id) as string;
    const frontendUrl = getFrontendUrl();
    try {
        if (!val_id || !tran_id) {
            console.error("Missing val_id or tran_id in SSLCommerz redirect:", { body: req.body, query: req.query });
        }
        await verifyAndFulfillPayment(val_id, tran_id);
        return res.redirect(`${frontendUrl}/recharge?status=success`);
    } catch (error) {
        console.error("Payment fulfillment error in handleSuccessRedirect:", error);
        return res.redirect(`${frontendUrl}/recharge?status=failed`);
    }
});

export const handleFailRedirect = asyncHandler(async (req: Request, res: Response) => {
    const tran_id = (req.body?.tran_id || req.query?.tran_id) as string;
    if (tran_id) {
        await handlePaymentFailureInDB(tran_id, 'FAILED');
    }
    const frontendUrl = getFrontendUrl();
    return res.redirect(`${frontendUrl}/recharge?status=failed`);
});

export const handleCancelRedirect = asyncHandler(async (req: Request, res: Response) => {
    const tran_id = (req.body?.tran_id || req.query?.tran_id) as string;
    if (tran_id) {
        await handlePaymentFailureInDB(tran_id, 'CANCELLED');
    }
    const frontendUrl = getFrontendUrl();
    return res.redirect(`${frontendUrl}/recharge?status=cancelled`);
});