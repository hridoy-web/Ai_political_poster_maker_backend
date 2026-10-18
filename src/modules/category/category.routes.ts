import { Router } from "express";
import { categoryController } from "./category.controller.js";

const router = Router();

// TODO(auth): admin only
router.post("/", categoryController.createCategory);
router.get("/admin/all", categoryController.listAllCategories);
router.patch("/:id", categoryController.updateCategory);
router.patch("/:id/status", categoryController.setCategoryStatus);

// public: active categories only
router.get("/", categoryController.listCategories);

export const CategoryRoutes = router;