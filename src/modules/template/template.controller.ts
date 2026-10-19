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

// Zod error ফরম্যাট করার হেল্পার
const formatIssues = (issues: ZodIssue[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

// টেমপ্লেট তৈরি
const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.createTemplate(parsed.data as any);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Template created successfully",
    data: result,
  });
});

// টেমপ্লেট তালিকা ও পেজিনেশন ফিল্টারিং
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

// নির্দিষ্ট টেমপ্লেটের বিস্তারিত
const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.getTemplateById(req.params.id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Template fetched successfully",
    data: result,
  });
});

// টেমপ্লেট আপডেট
const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await templateService.updateTemplate(
    req.params.id as string,
    parsed.data as any
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Template updated successfully",
    data: result,
  });
});

// টেমপ্লেট পাবলিশ করা
const publishTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.publishTemplate(req.params.id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Template published successfully",
    data: result,
  });
});

// টেমপ্লেট আর্কাইভ করা
const archiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.archiveTemplate(req.params.id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Template archived successfully",
    data: result,
  });
});

// টেমপ্লেট আন-আর্কাইভ করা
const unarchiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const result = await templateService.unarchiveTemplate(req.params.id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Template unarchived successfully",
    data: result,
  });
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