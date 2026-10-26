import type { Request, Response, NextFunction } from "express";

import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyGuestSessionToken } from "../modules/guest/guest.service.js";

export const verifyGuestSession = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.guest_session_id;

    // Cookie-র token যাচাই করে আসল session ID request-এ রাখি।
    req.guestSessionId = await verifyGuestSessionToken(token);

    next();
  },
);
export const requireUserOrGuest = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    // Login করা user আগে থেকেই auth middleware-এ যাচাই হয়েছে।
    if (req.user) {
      next();
      return;
    }

    // User না থাকলে guest cookie যাচাই করে আসল session ID রাখি।
    const token = req.cookies?.guest_session_id;
    req.guestSessionId = await verifyGuestSessionToken(token);

    next();
  },
);