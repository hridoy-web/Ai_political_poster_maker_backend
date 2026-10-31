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
  requirePermission(["category:create", "MANAGE_CATEGORIES"]),
  categoryController.createCategory
);

router.get(
  "/admin/all",
  verifyToken,
  requirePermission(["category:read:all", "MANAGE_CATEGORIES"]),
  categoryController.listAllCategories
);

router.patch(
  "/:id",
  verifyToken,
  requirePermission(["category:update", "MANAGE_CATEGORIES"]),
  categoryController.updateCategory
);

router.patch(
  "/:id/status",
  verifyToken,
  requirePermission(["category:status:update", "MANAGE_CATEGORIES"]),
  categoryController.setCategoryStatus
);

export const CategoryRoutes = router;