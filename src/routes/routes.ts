import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import authRoutes from "../modules/auth/auth.route.js";
import userRoutes from "../modules/user/user.route.js";

const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/auth", authRoutes);
router.use("/user", userRoutes);

export default router;
