import type { Request, Response } from "express";

import {
  cookieOptions,
  SEVEN_DAYS,
  googleLoginUser,
} from "./auth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";

// POST /api/v1/auth/google
export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
    console.log("googleLogin")
  const idToken = req.body?.idToken;

  if (typeof idToken !== "string" || !idToken) {
    throw new ApiError(400, "ID token is required");
  }

  const result = await googleLoginUser(idToken, req.cookies?.guest_session_id);

  res.cookie("token", result.token, {
    ...cookieOptions,
    maxAge: SEVEN_DAYS,
  });

  res.clearCookie("guest_session_id", cookieOptions);

  return sendResponse(res, 200, "Login successful", true, null, result);
});