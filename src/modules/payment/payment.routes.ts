import { Router } from 'express';
import { handleCancelRedirect, handleFailRedirect, handleSuccessRedirect, handleWebhook, initiatePayment } from './payment.controller.js';
import { requireBillingAuth } from './billing.auth.js';
import { validateRequest } from '../../middlewares/validateRequest.middleware.js';
import { initiatePaymentSchema, sslCommerzCallbackSchema } from './payment.validation.js';

import cors from 'cors';

const router = Router();
const permissiveCors = cors({ origin: true, credentials: true });

// POST /api/v1/payments (Leader proposed API) & POST /api/v1/payments/initiate
router.post('/', requireBillingAuth, validateRequest(initiatePaymentSchema), initiatePayment);
router.post('/initiate', requireBillingAuth, validateRequest(initiatePaymentSchema), initiatePayment);

// Webhook endpoints: flexible provider-based and SSLCommerz direct
router.post('/webhook/:provider', permissiveCors, handleWebhook);
router.post('/webhook/sslcommerz', permissiveCors, validateRequest(sslCommerzCallbackSchema), handleWebhook);

// Gateway redirect endpoints
router.all('/sslcommerz/success', permissiveCors, handleSuccessRedirect);
router.all('/sslcommerz/fail', permissiveCors, handleFailRedirect);
router.all('/sslcommerz/cancel', permissiveCors, handleCancelRedirect);

export const paymentRoutes = router;
export default router;