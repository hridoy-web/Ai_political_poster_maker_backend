import { Request, Response } from "express";
import { ZodIssue } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { templateService } from "./template.service.js";
import {
  createTemplateSchema,
  listTemplateQuerySchema,
  updateTemplateSchema,
} from "./template.validation.js";

const formatIssues = (issues: ZodIssue[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id; 
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.createTemplate(parsed.data, userId);

  sendResponse(res, 201, "Template created successfully", true, null, result);
});

const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listTemplateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.listTemplates(parsed.data);

  
  sendResponse(res, 200, "Templates fetched successfully", true, null, {
    items: result.items,
    meta: result.meta,
  });
});

const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const data = await templateService.getTemplateById(req.params.id as string, user);

  sendResponse(
    res,
     200,
      "Template fetched successfully", 
      true,
      null,
      data);
});

const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const userId = (req as any).user?.id;
  const data = await templateService.updateTemplate(
    req.params.id as string,
    parsed.data as any,
    userId
  );

  sendResponse(
    res,
     200,
      "Template updated successfully",
      true,
      null,
      data);
});

const publishTemplate = asyncHandler(async (req: Request, res: Response) => {
  const data = await templateService.publishTemplate(req.params.id as string);
  sendResponse(res, 200, "Template published successfully", true, null, data);
});

const archiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const data = await templateService.archiveTemplate(req.params.id as string);
  sendResponse(
    res,
     200, 
     "Template archived successfully",
      true,
      null,
      data);
});

const unarchiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const data = await templateService.unarchiveTemplate(req.params.id as string);
  sendResponse(res, 200, "Template unarchived successfully", true, null, data);
});

export const templateController = {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  publishTemplate,
  archiveTemplate,
  unarchiveTemplate,
};