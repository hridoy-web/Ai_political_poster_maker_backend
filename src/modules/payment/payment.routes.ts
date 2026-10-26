import { Router } from 'express';

import { handleCancelRedirect, handleFailRedirect, handleSuccessRedirect, handleWebhook, initiatePayment } from './payment.controller.js';

const router = Router();

router.post('/initiate', initiatePayment);
router.post('/webhook/sslcommerz', handleWebhook);
router.post('/sslcommerz/success', handleSuccessRedirect);
router.post('/sslcommerz/fail', handleFailRedirect);
router.post('/sslcommerz/cancel', handleCancelRedirect);

export const paymentRoutes = router;