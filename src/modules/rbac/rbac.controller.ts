import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { rbacService } from "./rbac.service.js";

const getRoles = asyncHandler(async (_req: Request, res: Response) => {
  const result = await rbacService.getRoles();
  sendResponse(res, 200, "Roles retrieved successfully", true, null, result);
});

const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const result = await rbacService.getRoleById(req.params.id as string);
  sendResponse(res, 200, "Role retrieved successfully", true, null, result);
});

const createRole = asyncHandler(async (req: Request, res: Response) => {
  const result = await rbacService.createRole(req.body);
  sendResponse(res, 201, "Role created successfully", true, null, result);
});

const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const result = await rbacService.updateRole(req.params.id as string, req.body);
  sendResponse(res, 200, "Role updated successfully", true, null, result);
});

const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const result = await rbacService.deleteRole(req.params.id as string);
  sendResponse(res, 200, "Role deleted successfully", true, null, result);
});

const getPermissions = asyncHandler(async (_req: Request, res: Response) => {
  const result = await rbacService.getPermissions();
  sendResponse(res, 200, "Permissions retrieved successfully", true, null, result);
});

const assignPermissions = asyncHandler(async (req: Request, res: Response) => {
  const result = await rbacService.assignPermissionsToRole(
    req.params.id as string,
    req.body
  );
  sendResponse(res, 200, "Permissions assigned successfully", true, null, result);
});

const removePermissions = asyncHandler(async (req: Request, res: Response) => {
  const result = await rbacService.removePermissionsFromRole(
    req.params.id as string,
    req.body
  );
  sendResponse(res, 200, "Permissions removed successfully", true, null, result);
});

export const rbacController = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getPermissions,
  assignPermissions,
  removePermissions,
};
