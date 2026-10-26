import { Router } from "express";
import { getWalletBalance, getWalletTransactions } from "./wallet.controller.js";
import { requireBillingAuth } from "../payment/billing.auth.js";

const router = Router();

// Apply self-contained billing authentication to all wallet routes
router.use(requireBillingAuth);

// GET /api/v1/wallet/balance (Leader proposed API)
router.get("/balance", getWalletBalance);

// GET /api/v1/wallet/transactions (Leader proposed API)
router.get("/transactions", getWalletTransactions);

// GET /api/v1/wallet/me (Convenience alias)
router.get("/me", getWalletBalance);

// GET /api/v1/wallet
router.get("/", getWalletBalance);

export const walletRoutes = router;
export default router;
