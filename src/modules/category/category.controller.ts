
import { Request, Response, NextFunction } from "express";
import { categoryService } from "./category.service.js";
import { updateCategorySchema, updateCategoryStatusSchema } from "./category.validation.js";

const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, sortOrder } = req.body;
    const data = await categoryService.createCategory({ name, slug, sortOrder });
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

// updated Category
const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      const error = new Error(message) as Error & { statusCode?: number };
      error.statusCode = 400;
      return next(error);
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
      const error = new Error("isActive অবশ্যই true বা false হতে হবে") as Error & { statusCode?: number };
      error.statusCode = 400;
      return next(error);
    }

    const data = await categoryService.setCategoryStatus(req.params.id as string, parsed.data.isActive);
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