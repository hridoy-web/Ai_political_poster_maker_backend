import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { categoryController } from "./category.controller.js";

const router = Router();

// Management routes: protected by verifyToken + requirePermission
router.post(
  "/",
  verifyToken,
  requirePermission("category:create"),
  categoryController.createCategory
);
router.get(
  "/admin/all",
  verifyToken,
  requirePermission("category:read:all"),
  categoryController.listAllCategories
);
router.patch(
  "/:id",
  verifyToken,
  requirePermission("category:update"),
  categoryController.updateCategory
);
router.patch(
  "/:id/status",
  verifyToken,
  requirePermission("category:status:update"),
  categoryController.setCategoryStatus
);

// Public catalog: active categories only
router.get("/", categoryController.listCategories);

export const CategoryRoutes = router;
