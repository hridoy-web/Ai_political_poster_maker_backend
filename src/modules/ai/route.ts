import { Router, Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { aiController } from "./ai.controller.js";

const router = Router();

interface TokenPayload extends JwtPayload {
  id: string;
}

/**
 * Optional authentication middleware:
 * If an auth token is provided (via cookie or Bearer header), it resolves req.user.
 * If no token is provided, the request proceeds as an anonymous or guest session.
 */
const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

    if (!token) {
      return next();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    const decoded = jwt.verify(token, secret) as TokenPayload;
    if (decoded?.id) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true },
      });
      if (user) {
        (req as any).user = user;
      }
    }
    next();
  } catch (_err) {
    // If token is invalid or expired, continue as guest rather than blocking public AI preview
    next();
  }
};

/**
 * Routes:
 * POST /api/v1/ai/generate-slogans  - Generate AI slogans (supports user & guest)
 * GET  /api/v1/ai/tasks/:id         - Check status of specific AiTask
 */
router.post("/generate-slogans", optionalAuth, aiController.generateSlogans);
router.get("/tasks/:id", aiController.getTaskStatus);

export const aiRoutes = router;
export default router;
