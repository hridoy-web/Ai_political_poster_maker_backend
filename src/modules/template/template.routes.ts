import { Router } from "express";
import { templateController } from "./template.controller.js";
import { verifyToken, optionalAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

// Public routes
router.get("/", templateController.listTemplates);
router.get("/:id", optionalAuth, templateController.getTemplate);

// Protected Management routes
router.post(
  "/",
  verifyToken,
  requirePermission(["template:create", "MANAGE_TEMPLATES"]),
  templateController.createTemplate
);

router.patch(
  "/:id",
  verifyToken,
  requirePermission(["template:update", "MANAGE_TEMPLATES"]),
  templateController.updateTemplate
);

router.post(
  "/:id/publish",
  verifyToken,
  requirePermission(["template:publish", "MANAGE_TEMPLATES"]),
  templateController.publishTemplate
);

router.post(
  "/:id/archive",
  verifyToken,
  requirePermission(["template:archive", "MANAGE_TEMPLATES"]),
  templateController.archiveTemplate
);

router.post(
  "/:id/unarchive",
  verifyToken,
  requirePermission(["template:unarchive", "MANAGE_TEMPLATES"]),
  templateController.unarchiveTemplate
);

router.delete(
  "/:id",
  verifyToken,
  requirePermission(["template:archive", "template:update", "MANAGE_TEMPLATES"]),
  templateController.deleteTemplate
);

export const TemplateRoutes = router;