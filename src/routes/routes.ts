import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import { CategoryRoutes } from "../modules/category/category.routes.js";

const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/category", CategoryRoutes);

export default router;