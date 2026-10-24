import { Router, type Request, type Response, type NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { posterController } from "./poster.controller.js";

const router = Router();

interface TokenPayload extends JwtPayload {
  id: string;
}

/**
 * Optional authentication middleware:
 * - If JWT token is provided via cookie or Bearer header, attaches verified user to req.user.
 * - If no token or invalid, allows request to proceed so guests can use x-guest-session-id.
 */
const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

    if (!token) return next();

    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    const decoded = jwt.verify(token, secret) as TokenPayload;
    if (decoded?.id) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true },
      });
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch {
    next();
  }
};

router.use(optionalAuth);

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
