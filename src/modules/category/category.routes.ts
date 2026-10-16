import { Router } from "express";
import { categoryController } from "./category.controller.js";

const router = Router();

router.post("/", categoryController.createCategory);
router.get("/", categoryController.listCategories);
router.get("/admin/all", categoryController.listAllCategories);
router.patch("/:id", categoryController.updateCategory);
router.patch("/:id/status", categoryController.setCategoryStatus);

export const CategoryRoutes = router;