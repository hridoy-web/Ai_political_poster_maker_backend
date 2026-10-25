import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { initiatePaymentSession, verifyAndFulfillPayment } from './payment.service.js';
import sendResponse from '../../utils/sendResponse.js';


export const initiatePayment = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const result = await initiatePaymentSession(userId, req.body);
    return sendResponse(res, 200, 'Payment initiated successfully', true, null, result);
});

export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
    const { val_id, tran_id } = req.body;
    await verifyAndFulfillPayment(val_id, tran_id);
    return sendResponse(res, 200, 'Webhook processed successfully', true, null, null);
});

export const handleSuccessRedirect = asyncHandler(async (req: Request, res: Response) => {
    const { val_id, tran_id } = req.body;
    try {
        
        await verifyAndFulfillPayment(val_id, tran_id);
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard/history?status=success`);

    } catch (error) {
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard/history?status=failed`);
    }
});

export const handleFailRedirect = asyncHandler(async (req: Request, res: Response) => {

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard/history?status=failed`);

});

export const handleCancelRedirect = asyncHandler(async (req: Request, res: Response) => {

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard/history?status=cancelled`);

});