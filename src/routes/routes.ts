import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";

const router = Router();

router.use("/uploads", uploadRoutes);

export default router;