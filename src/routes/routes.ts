import { Router } from "express";
import uploadRouter from "../modules/upload/upload.route.js";
import authRouter from "../modules/auth/auth.route.js";
import userRouter from "../modules/user/user.route.js";
import { CategoryRoutes as categoryRouter } from "../modules/category/category.routes.js";
import { TemplateRoutes as templateRouter } from "../modules/template/template.routes.js";
import aiRouter from "../modules/ai/route.js";
import bookmarkRouter from "../modules/bookmark/bookmark.route.js";
import posterRoutes from "../modules/poster/route.js";
import guestRouter from "../modules/guest/guest.route.js";
import { packageRoutes } from "../modules/package/package.routes.js";
import { paymentRoutes } from "../modules/payment/payment.routes.js";
import { walletRoutes } from "../modules/wallet/wallet.routes.js";
import { transactionRoutes } from "../modules/transaction/transaction.routes.js";
import { subscriptionRoutes } from "../modules/subscription/subscription.routes.js";

const router = Router();

router.use("/upload", uploadRouter);
router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/category", categoryRouter);
router.use("/template", templateRouter);
router.use("/bookmarks", bookmarkRouter);
router.use("/ai", aiRouter);
router.use("/posters", posterRoutes);
router.use("/guest", guestRouter);

// Dev 7: Billing, Packages, Payments, Wallets, Transactions, and Subscriptions
router.use("/package", packageRoutes);
router.use("/packages", packageRoutes);
router.use("/payment", paymentRoutes);
router.use("/payments", paymentRoutes);
router.use("/wallet", walletRoutes);
router.use("/wallets", walletRoutes);
router.use("/transaction", transactionRoutes);
router.use("/transactions", transactionRoutes);
router.use("/subscription", subscriptionRoutes);
router.use("/subscriptions", subscriptionRoutes);

export default router;