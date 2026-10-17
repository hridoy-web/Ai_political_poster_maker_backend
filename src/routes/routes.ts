import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import authRoutes from "../modules/auth/auth.route.js";

const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/auth", authRoutes);

export default router;