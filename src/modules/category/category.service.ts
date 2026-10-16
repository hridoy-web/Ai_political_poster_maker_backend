import { prisma } from "../../lib/prisma.js";
import { ICreateCategoryInput } from "./category.interface.js";


type UpdateCategoryInput = {
  name?: string;
  slug?: string;
  sortOrder?: number;
};


const createCategory = async (data: ICreateCategoryInput) => {
  return prisma.templateCategory.create({ data });
};

const listCategories = async (includeInactive: boolean) => {
  return prisma.templateCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
};


// updated Category
const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  try {
    return await prisma.templateCategory.update({ where: { id }, data });
  } catch (err: any) {
    if (err.code === "P2025") {
      const error = new Error("Category খুঁজে পাওয়া যায়নি") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    if (err.code === "P2002") {
      const error = new Error("এই slug আগে থেকেই আছে") as Error & { statusCode?: number };
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }
};

const setCategoryStatus = async (id: string, isActive: boolean) => {
  try {
    return await prisma.templateCategory.update({ where: { id }, data: { isActive } });
  } catch (err: any) {
    if (err.code === "P2025") {
      const error = new Error("Category খুঁজে পাওয়া যায়নি") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    throw err;
  }
};


export const categoryService = {
  createCategory,
  listCategories,
  updateCategory,
  setCategoryStatus,
};