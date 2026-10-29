import { Router } from "express";
import { aiController } from "./ai.controller.js";
import { requireUserOrGuest } from "../../middlewares/guest.middleware.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";

const router = Router();

// Rate limit to prevent LLM quota exhaustion and API spamming
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per IP
  message: "AI generation quota exceeded for this IP. Please wait 15 minutes.",
});

/**
 * Routes:
 * POST /api/v1/ai/generate-slogans  - Generate AI slogans (fast, synchronous)
 * POST /api/v1/ai/tasks             - Enqueue long-running AI task (returns taskId, status: PENDING)
 * POST /api/v1/ai/remove-background - Enqueue async background removal
 * GET  /api/v1/ai/tasks/:id         - Check status of specific AiTask (with ownership security)
 */
router.use(optionalAuth);
router.use(requireUserOrGuest);

router.post("/generate-slogans", aiLimiter, aiController.generateSlogans);
router.post("/tasks", aiLimiter, aiController.createTask);
router.post("/remove-background", aiLimiter, aiController.removeBackground);
router.get("/tasks/:id", aiController.getTaskStatus);

export const aiRoutes = router;
export default router;
