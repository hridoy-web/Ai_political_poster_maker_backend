import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { ICreateCategoryInput, UpdateCategoryInput } from "./category.interface.js";

const createCategory = async (data: ICreateCategoryInput) => {
  const existing = await prisma.templateCategory.findFirst({
    where: {
      OR: [{ slug: data.slug }, { name: data.name }],
    },
  });

  if (existing) {
    throw new ApiError(409, "Category with this slug or name already exists");
  }

  return await prisma.templateCategory.create({ data });
};

const listCategories = async (includeInactive: boolean) => {
  return await prisma.templateCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
};

const getCategoryById = async (id: string) => {
  const category = await prisma.templateCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  return category;
};

const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  await getCategoryById(id);

  if (data.slug) {
    const slugConflict = await prisma.templateCategory.findFirst({
      where: {
        slug: data.slug,
        NOT: { id },
      },
    });

    if (slugConflict) {
      throw new ApiError(409, "Slug already exists");
    }
  }

  return await prisma.templateCategory.update({
    where: { id },
    data,
  });
};

const setCategoryStatus = async (id: string, isActive: boolean) => {
  await getCategoryById(id);

  return await prisma.templateCategory.update({
    where: { id },
    data: { isActive },
  });
};

export const categoryService = {
  createCategory,
  listCategories,
  getCategoryById,
  updateCategory,
  setCategoryStatus,
};