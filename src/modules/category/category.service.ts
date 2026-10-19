import { prisma } from "../../lib/prisma.js";
import { ICreateCategoryInput, UpdateCategoryInput } from "./category.interface.js";

type HttpError = Error & { statusCode?: number };

const httpError = (statusCode: number, message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

const createCategory = async (data: ICreateCategoryInput) => {
  try {
    return await prisma.templateCategory.create({ data });
  } catch (err: any) {
    if (err.code === "P2002") throw httpError(409, "Slug or name already exists");
    throw err;
  }
};

const listCategories = async (includeInactive: boolean) => {
  return prisma.templateCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
};

const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  try {
    return await prisma.templateCategory.update({ where: { id }, data });
  } catch (err: any) {
    if (err.code === "P2025") throw httpError(404, "Category not found");
    if (err.code === "P2002") throw httpError(409, "Slug already exists");
    throw err;
  }
};

const setCategoryStatus = async (id: string, isActive: boolean) => {
  try {
    return await prisma.templateCategory.update({ where: { id }, data: { isActive } });
  } catch (err: any) {
    if (err.code === "P2025") throw httpError(404, "Category not found");
    throw err;
  }
};

export const categoryService = {
  createCategory,
  listCategories,
  updateCategory,
  setCategoryStatus,
};