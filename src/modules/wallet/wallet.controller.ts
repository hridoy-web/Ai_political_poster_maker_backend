import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import {
  getWalletBalanceFromDB,
  getWalletTransactionsFromDB,
} from "./wallet.service.js";

export const getWalletBalance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const result = await getWalletBalanceFromDB(userId);
  return sendResponse(res, 200, "Wallet balance retrieved successfully", true, null, result);
});

export const getWalletTransactions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));

  const result = await getWalletTransactionsFromDB(userId, page, limit);
  return sendResponse(res, 200, "Wallet transactions retrieved successfully", true, null, result);
});
