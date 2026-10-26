import { Router } from "express";
import { getMyTransactions } from "./transaction.controller.js";
import { requireBillingAuth } from "../payment/billing.auth.js";

const router = Router();

router.use(requireBillingAuth);

// GET /api/v1/transaction/my-history
router.get("/my-history", getMyTransactions);

// GET /api/v1/transaction/
router.get("/", getMyTransactions);

export const transactionRoutes = router;
export default router;
