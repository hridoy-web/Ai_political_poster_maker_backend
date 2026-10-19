import { Request, Response } from "express";
import { ZodIssue } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { categoryService } from "./category.service.js";
import {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from "./category.validation.js";

// Zod error 
const formatIssues = (issues: ZodIssue[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

// createCategory
const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await categoryService.createCategory(parsed.data);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Category created successfully",
    data: result,
  });
});


const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const result = await categoryService.listCategories(false);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Categories fetched successfully",
    data: result,
  });
});


const listAllCategories = asyncHandler(async (_req: Request, res: Response) => {
  const result = await categoryService.listCategories(true);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "All categories fetched successfully",
    data: result,
  });
});

// updated category
const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const result = await categoryService.updateCategory(
    req.params.id as string,
    parsed.data
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category updated successfully",
    data: result,
  });
});

// category status
const setCategoryStatus = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateCategoryStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "isActive must be true or false");
  }

  const result = await categoryService.setCategoryStatus(
    req.params.id as string,
    parsed.data.isActive
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category status updated successfully",
    data: result,
  });
});

export const categoryController = {
  createCategory,
  listCategories,
  listAllCategories,
  updateCategory,
  setCategoryStatus,
};