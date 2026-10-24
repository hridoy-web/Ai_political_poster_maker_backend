import { Router } from "express";
import uploadRoutes from "../modules/upload/upload.route.js";
import authRoutes from "../modules/auth/auth.route.js";
import userRoutes from "../modules/user/user.route.js";
import { CategoryRoutes } from "../modules/category/category.routes.js";
import { TemplateRoutes } from "../modules/template/template.routes.js";
import aiRoutes from "../modules/ai/route.js";
import bookmarkRoutes from "../modules/bookmark/bookmark.route.js";
import posterRoutes from "../modules/poster/route.js";


const router = Router();

router.use("/uploads", uploadRoutes);
router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/category", CategoryRoutes);
router.use("/template", TemplateRoutes);
router.use("/bookmarks", bookmarkRoutes);
router.use("/ai", aiRoutes);
router.use("/posters", posterRoutes);

export default router;
