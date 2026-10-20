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

// Zod error
const formatIssues = (issues: ZodIssue[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

// template create
const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.createTemplate(parsed.data as any);

  // sendResponse(res, statusCode, message, success, error, data)
  sendResponse(
    res,
    201,
    "Template created successfully",
    true,
    null,
    result
  );
});

// list template pagination
const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listTemplateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.listTemplates(parsed.data);

  res.status(200).json({
    success: true,
    message: "Templates fetched successfully",
    data: result.items,
    meta: result.meta,
  });
});

// get template by id
const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.getTemplateById(req.params.id as string);

  sendResponse(
    res,
    200,
    "Template fetched successfully",
    true,
    null,
    result
  );
});

// template update
const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.updateTemplate(
    req.params.id as string,
    parsed.data as any
  );

  sendResponse(
    res,
    200,
    "Template updated successfully",
    true,
    null,
    result
  );
});

// template publish
const publishTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.publishTemplate(req.params.id as string);

  sendResponse(
    res,
    200,
    "Template published successfully",
    true,
    null,
    result
  );
});

// template archive
const archiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.archiveTemplate(req.params.id as string);

  sendResponse(
    res,
    200,
    "Template archived successfully",
    true,
    null,
    result
  );
});

// template unarchive
const unarchiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.unarchiveTemplate(req.params.id as string);

  sendResponse(
    res,
    200,
    "Template unarchived successfully",
    true,
    null,
    result
  );
});

export const templateController = {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  publishTemplate,
  archiveTemplate,
  unarchiveTemplate,};