import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { adminService } from "./admin.service.js";

const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getUsers(req.query);
  sendResponse(res, 200, "Users retrieved successfully", true, null, result);
});

const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getUserById(req.params.id as string);
  sendResponse(res, 200, "User details retrieved successfully", true, null, result);
});

const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.updateUserRole(
    req.params.id as string,
    req.body
  );
  sendResponse(res, 200, "User role updated successfully", true, null, result);
});

const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.updateUserStatus(
    req.params.id as string,
    req.body.status
  );
  sendResponse(res, 200, "User status updated successfully", true, null, result);
});

const getOverviewAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getOverviewAnalytics();
  sendResponse(res, 200, "Admin overview analytics retrieved successfully", true, null, result);
});

const getVisitorAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const result = await adminService.getVisitorAnalytics();
  sendResponse(res, 200, "Visitor analytics retrieved successfully", true, null, result);
});

const getPosters = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getPosters(req.query);
  sendResponse(res, 200, "Admin posters retrieved successfully", true, null, result);
});

const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getTransactions(req.query);
  sendResponse(res, 200, "Admin transactions retrieved successfully", true, null, result);
});

export const adminController = {
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  getOverviewAnalytics,
  getVisitorAnalytics,
  getPosters,
  getTransactions,
};
