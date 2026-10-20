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

  sendResponse(
    res,
    201,
    "Category created successfully",
    true,
    null,
    result
  );
});

// listCategories
const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const result = await categoryService.listCategories(false);

  sendResponse(
    res,
    200,
    "Categories fetched successfully",
    true,
    null,
    result
  );
});

// listAllCategories
const listAllCategories = asyncHandler(async (_req: Request, res: Response) => {
  const result = await categoryService.listCategories(true);

  sendResponse(
    res,
    200,
    "All categories fetched successfully",
    true,
    null,
    result
  );
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

  sendResponse(
    res,
    200,
    "Category updated successfully",
    true,
    null,
    result
  );
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

  sendResponse(
    res,
    200,
    "Category status updated successfully",
    true,
    null,
    result
  );
});

export const categoryController = {
  createCategory,
  listCategories,
  listAllCategories,
  updateCategory,
  setCategoryStatus,
};