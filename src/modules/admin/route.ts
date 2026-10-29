import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { adminController } from "./admin.controller.js";

const router = Router();

// Protect all admin endpoints with authentication and admin:users:manage permission
router.use(verifyToken, requirePermission("admin:users:manage"));

router.get("/analytics/overview", adminController.getOverviewAnalytics);
router.get("/analytics/visitors", adminController.getVisitorAnalytics);
router.get("/posters", adminController.getPosters);
router.get("/transactions", adminController.getTransactions);
router.get("/users", adminController.getUsers);
router.get("/users/:id", adminController.getUserById);
router.patch("/users/:id/role", adminController.updateUserRole);
router.patch("/users/:id/status", adminController.updateUserStatus);

export default router;
