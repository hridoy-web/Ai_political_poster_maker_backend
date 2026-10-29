import { Router } from "express";
import {
  handleCancelRedirect,
  handleFailRedirect,
  handleSuccessRedirect,
  handleWebhook,
  initiatePayment,
} from "./payment.controller.js";
import { requireBillingAuth } from "./billing.auth.js";
import { validateRequest } from "../../middlewares/validateRequest.middleware.js";
import {
  initiatePaymentSchema,
  sslCommerzCallbackSchema,
} from "./payment.validation.js";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import cors from "cors";

const router = Router();
const permissiveCors = cors({ origin: true, credentials: true });

// Rate limit payment session creation to prevent runaway invoice spamming
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 requests per IP
  message: "Too many payment checkout attempts. Please try again later.",
});

// POST /api/v1/payments & POST /api/v1/payments/initiate
router.post(
  "/",
  requireBillingAuth,
  paymentLimiter,
  validateRequest(initiatePaymentSchema),
  initiatePayment
);
router.post(
  "/initiate",
  requireBillingAuth,
  paymentLimiter,
  validateRequest(initiatePaymentSchema),
  initiatePayment
);

// Webhook endpoints: flexible provider-based and SSLCommerz direct
router.post("/webhook/:provider", permissiveCors, handleWebhook);
router.post(
  "/webhook/sslcommerz",
  permissiveCors,
  validateRequest(sslCommerzCallbackSchema),
  handleWebhook
);

// Gateway redirect endpoints
router.all("/sslcommerz/success", permissiveCors, handleSuccessRedirect);
router.all("/sslcommerz/fail", permissiveCors, handleFailRedirect);
router.all("/sslcommerz/cancel", permissiveCors, handleCancelRedirect);

export const paymentRoutes = router;
export default router;
