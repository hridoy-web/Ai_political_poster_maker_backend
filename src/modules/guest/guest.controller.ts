import type { Request, Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { createGuestSession } from "./guest.service.js";

export const createGuest = asyncHandler(
  async (_req: Request, res: Response) => {
    const session = await createGuestSession();

    // আসল token HttpOnly cookie-তে রাখি; JavaScript দিয়ে পড়া যাবে না।
    res.cookie("guest_session_id", session.guestToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    // Client-কে session-এর ID ও মেয়াদ জানাই; secret token response-এ দিই না।
    return sendResponse(
      res,
      201,
      "Guest session created",
      true,
      null,
      {
        guestSessionId: session.guestSessionId,
        expiresAt: session.expiresAt,
      },
    );
  },
);