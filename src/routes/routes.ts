import { Router } from "express";
import uploadRouter from "../modules/upload/upload.route.js";
import authRouter from "../modules/auth/auth.route.js";
import userRouter from "../modules/user/user.route.js";
import { CategoryRoutes as categoryRouter } from "../modules/category/category.routes.js";
import { TemplateRoutes as templateRouter } from "../modules/template/template.routes.js";
import aiRouter from "../modules/ai/route.js";
import bookmarkRouter from "../modules/bookmark/bookmark.route.js";
import posterRoutes from "../modules/poster/route.js";

const router = Router();

router.use("/upload", uploadRouter);
router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/category", categoryRouter);
router.use("/template", templateRouter);
router.use("/bookmarks", bookmarkRouter);
router.use("/ai", aiRouter);
router.use("/posters", posterRoutes);

export default router;

