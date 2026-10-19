import { Request, Response, NextFunction } from "express";
import { categoryService } from "./category.service.js";
import {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from "./category.validation.js";

type HttpError = Error & { statusCode?: number };

const badRequest = (message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = 400;
  return error;
};

const formatIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(badRequest(formatIssues(parsed.error.issues)));
    }

    const data = await categoryService.createCategory(parsed.data);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const listCategories = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.listCategories(false);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const listAllCategories = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.listCategories(true);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(badRequest(formatIssues(parsed.error.issues)));
    }

    const data = await categoryService.updateCategory(req.params.id as string, parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const setCategoryStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateCategoryStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(badRequest("isActive must be true or false"));
    }

    const data = await categoryService.setCategoryStatus(
      req.params.id as string,
      parsed.data.isActive
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const categoryController = {
  createCategory,
  listCategories,
  listAllCategories,
  updateCategory,
  setCategoryStatus,
};