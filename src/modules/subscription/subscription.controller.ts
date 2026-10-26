import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import {
  getMyActiveSubscriptionFromDB,
  getMySubscriptionHistoryFromDB,
} from "./subscription.service.js";

export const getMySubscription = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const result = await getMyActiveSubscriptionFromDB(userId);
  return sendResponse(
    res,
    200,
    result ? "Active subscription retrieved successfully" : "No active subscription found",
    true,
    null,
    result
  );
});

export const getMySubscriptionHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const result = await getMySubscriptionHistoryFromDB(userId);
  return sendResponse(res, 200, "Subscription history retrieved successfully", true, null, result);
});
