import { Router } from "express";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { requireUserOrGuest } from "../../middlewares/guest.middleware.js";
import { posterController } from "./poster.controller.js";

const router = Router();

router.use(optionalAuth);
router.use(requireUserOrGuest);

// Project Draft & Workspace CRUD
router.post("/", posterController.createPoster);
router.get("/", posterController.listPosters);
router.get("/:id", posterController.getPosterById);
router.patch("/:id", posterController.updatePoster);
router.delete("/:id", posterController.deletePoster);
router.post("/:id/duplicate", posterController.duplicatePoster);

// Render Lifecycle & Status Polling
router.post("/:id/render", posterController.triggerRender);
router.get("/:id/status", posterController.getPosterStatus);

export default router;
