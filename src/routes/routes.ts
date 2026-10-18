import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import { CategoryRoutes } from "../modules/category/category.routes.js";
import { TemplateRoutes } from "../modules/template/template.routes.js";

const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/category", CategoryRoutes);
router.use("/template", TemplateRoutes);

export default router;
