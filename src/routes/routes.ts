import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import authRoutes from "../modules/auth/auth.route.js";
import { getCurrentUser } from "../modules/user/user.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/auth", authRoutes);
router.use("/me", verifyToken, getCurrentUser);

export default router;
