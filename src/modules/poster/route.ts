import { Router } from "express";
import { posterController } from "./poster.controller.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { requireUserOrGuest } from "../../middlewares/guest.middleware.js";

const router = Router();

// Poster route-ও shared middleware-এর verified user/guest identity ব্যবহার করে।
router.use(optionalAuth);
router.use(requireUserOrGuest);

router.post("/", posterController.createPoster);
router.get("/", posterController.listPosters);
router.get("/:id", posterController.getPosterById);
router.patch("/:id", posterController.updatePoster);
router.delete("/:id", posterController.deletePoster);
router.post("/:id/duplicate", posterController.duplicatePoster);
router.post("/:id/render", posterController.triggerRender);
router.get("/:id/status", posterController.getPosterStatus);

export default router;