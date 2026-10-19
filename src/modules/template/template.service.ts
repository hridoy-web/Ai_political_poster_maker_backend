import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { cleanTemplateHtml, cleanTemplateCss } from "../../lib/sanitizeHtml.js";
import { configSchema } from "./template.validation.js";
import type {
  ICreateTemplateInput,
  IUpdateTemplateInput,
  IListTemplateQuery,
} from "./template.interface.js";

const sanitizeConfig = (config: any) => ({
  ...config,
  html: cleanTemplateHtml(config.html),
  css: cleanTemplateCss(config.css ?? ""),
});

type HttpError = Error & { statusCode?: number };

const httpError = (statusCode: number, message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

const createTemplate = async (data:ICreateTemplateInput) => {
  // category exists and active
  const category = await prisma.templateCategory.findUnique({
    where: { id: data.categoryId },
  });
  if (!category) throw httpError(404, "Category not found");
  if (!category.isActive) throw httpError(400, "Category is inactive");

  // preview asset exists
  if (data.previewAssetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: data.previewAssetId },
    });
    if (!asset) throw httpError(404, "Preview asset not found");
  }

  return prisma.template.create({
    data: { ...data, config: sanitizeConfig(data.config), status: "DRAFT" },
  });
};

const listTemplates = async (query: IListTemplateQuery) => {
  const where = {
    status: "PUBLISHED" as const,
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.accessLevel && { accessLevel: query.accessLevel }),
  };

  const [items, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.template.count({ where }),
  ]);

  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

const getTemplateById = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw httpError(404, "Template not found");
  return template;
};

const updateTemplate = async (
  id: string,
  data: IUpdateTemplateInput
) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw httpError(404, "Template not found");
  if (template.status === "ARCHIVED") {
    throw httpError(400, "Archived template cannot be edited");
  }

  if (data.categoryId) {
    const category = await prisma.templateCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) throw httpError(404, "Category not found");
    if (!category.isActive) throw httpError(400, "Category is inactive");
  }

  if (data.previewAssetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: data.previewAssetId },
    });
    if (!asset) throw httpError(404, "Preview asset not found");
  }

  const updateData = data.config
    ? { ...data, config: sanitizeConfig(data.config) }
    : data;

  return prisma.template.update({ where: { id }, data: updateData });
};

const publishTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw httpError(404, "Template not found");
  if (template.status !== "DRAFT") {
    throw httpError(400, "Only draft template can be published");
  }

  // config must match the current HTML format
  const result = configSchema.safeParse(template.config);
  if (!result.success) {
    throw httpError(400, "Template config is invalid or in old format");
  }

  return prisma.template.update({
    where: { id },
    data: { status: "PUBLISHED" },
  });
};

const archiveTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw httpError(404, "Template not found");
  if (template.status !== "PUBLISHED") {
    throw httpError(400, "Only published template can be archived");
  }

  return prisma.template.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
};

const unarchiveTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw httpError(404, "Template not found");
  if (template.status !== "ARCHIVED") {
    throw httpError(400, "Only archived template can be restored");
  }

  return prisma.template.update({
    where: { id },
    data: { status: "PUBLISHED", archivedAt: null },
  });
};

export const templateService = {
  createTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  publishTemplate,
  archiveTemplate,
  unarchiveTemplate,
};