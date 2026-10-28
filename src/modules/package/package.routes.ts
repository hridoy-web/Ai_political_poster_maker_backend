import { Router } from "express";
import { createPackage, getPackages } from "./package.controller.js";
import { validateRequest } from "../../middlewares/validateRequest.middleware.js";
import { createPackageSchema } from "./package.validation.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

// GET /api/v1/packages (Public listing)
router.get("/", getPackages);

// POST /api/v1/packages (Restricted to authorized administrators)
router.post(
  "/",
  verifyToken,
  requirePermission(["package:create", "admin:packages:manage"]),
  validateRequest(createPackageSchema),
  createPackage
);

export const packageRoutes = router;
export default router;
