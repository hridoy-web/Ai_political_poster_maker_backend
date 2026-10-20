import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import { CategoryRoutes } from "../modules/category/category.routes.js";
import { TemplateRoutes } from "../modules/template/template.routes.js";
import aiRoutes from "../modules/ai/route.js";

const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/category", CategoryRoutes);
router.use("/template", TemplateRoutes);
router.use("/ai", aiRoutes);

export default router;
