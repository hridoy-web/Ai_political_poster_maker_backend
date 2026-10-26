import { Router } from "express";
import { aiController } from "./ai.controller.js";
import { requireUserOrGuest } from "../../middlewares/guest.middleware.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";

const router = Router();



/**
 * Routes:
 * POST /api/v1/ai/generate-slogans  - Generate AI slogans (fast, synchronous)
 * POST /api/v1/ai/tasks             - Enqueue long-running AI task (returns taskId, status: PENDING)
 * POST /api/v1/ai/remove-background - Enqueue async background removal
 * GET  /api/v1/ai/tasks/:id         - Check status of specific AiTask (with ownership security)
 */
router.use(optionalAuth);
router.use(requireUserOrGuest);

router.post("/generate-slogans", aiController.generateSlogans);
router.post("/tasks", aiController.createTask);
router.post("/remove-background", aiController.removeBackground);
router.get("/tasks/:id", aiController.getTaskStatus);

export const aiRoutes = router;
export default router;