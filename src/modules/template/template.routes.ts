import { Router } from "express";
import { templateController } from "./template.controller.js";

const router = Router();

// TODO(auth):  admin
router.post("/", templateController.createTemplate);
router.patch("/:id", templateController.updateTemplate);
router.post("/:id/publish", templateController.publishTemplate);
router.post("/:id/archive", templateController.archiveTemplate);
router.post("/:id/unarchive", templateController.unarchiveTemplate);

//  PUBLISHED template
router.get("/", templateController.listTemplates);
router.get("/:id", templateController.getTemplate);

export const TemplateRoutes = router;