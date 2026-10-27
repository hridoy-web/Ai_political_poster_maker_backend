import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { rbacController } from "./rbac.controller.js";

const router = Router();

// Protect all RBAC management routes with authentication and rbac:manage permission
router.use(verifyToken, requirePermission("rbac:manage"));

router.get("/roles", rbacController.getRoles);
router.post("/roles", rbacController.createRole);
router.get("/roles/:id", rbacController.getRoleById);
router.patch("/roles/:id", rbacController.updateRole);
router.delete("/roles/:id", rbacController.deleteRole);

router.get("/permissions", rbacController.getPermissions);
router.post("/roles/:id/permissions", rbacController.assignPermissions);
router.delete("/roles/:id/permissions", rbacController.removePermissions);

export default router;
