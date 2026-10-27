import { Router } from "express";
import { categoryController } from "./category.controller.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

// Public route
router.get("/", categoryController.listCategories);

// Protected routes
router.post(
  "/",
  verifyToken,
  requirePermission("MANAGE_CATEGORIES"),
  categoryController.createCategory
);

router.get(
  "/admin/all",
  verifyToken,
  requirePermission("MANAGE_CATEGORIES"),
  categoryController.listAllCategories
);

router.patch(
  "/:id",
  verifyToken,
  requirePermission("MANAGE_CATEGORIES"),
  categoryController.updateCategory
);

router.patch(
  "/:id/status",
  verifyToken,
  requirePermission("MANAGE_CATEGORIES"),
  categoryController.setCategoryStatus
);

export const CategoryRoutes = router;