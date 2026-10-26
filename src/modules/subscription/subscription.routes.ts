import { Router } from "express";
import { getMySubscription, getMySubscriptionHistory } from "./subscription.controller.js";
import { requireBillingAuth } from "../payment/billing.auth.js";

const router = Router();

router.use(requireBillingAuth);

// GET /api/v1/subscription/me (Leader proposed API)
router.get("/me", getMySubscription);

// GET /api/v1/subscription/history
router.get("/history", getMySubscriptionHistory);

export const subscriptionRoutes = router;
export default router;
