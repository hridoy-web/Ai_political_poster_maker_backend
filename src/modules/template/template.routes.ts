import { Router } from "express";
import { optionalAuth, verifyToken } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { templateController } from "./template.controller.js";

const router = Router();

// Management routes: protected by verifyToken + requirePermission
router.post(
  "/",
  verifyToken,
  requirePermission("template:create"),
  templateController.createTemplate
);
router.patch(
  "/:id",
  verifyToken,
  requirePermission("template:update"),
  templateController.updateTemplate
);
router.post(
  "/:id/publish",
  verifyToken,
  requirePermission("template:publish"),
  templateController.publishTemplate
);
router.post(
  "/:id/archive",
  verifyToken,
  requirePermission("template:archive"),
  templateController.archiveTemplate
);
router.post(
  "/:id/unarchive",
  verifyToken,
  requirePermission("template:unarchive"),
  templateController.unarchiveTemplate
);

// Public catalog routes: open without requiring permission checks
router.get("/", templateController.listTemplates);
router.get("/:id", optionalAuth, templateController.getTemplate);

export const TemplateRoutes = router;