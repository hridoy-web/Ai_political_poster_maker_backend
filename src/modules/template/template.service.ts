import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
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

// ১. Dev 8: Asset Ownership, Guest & Visibility Check
const validatePreviewAsset = async (assetId: string, userId?: string) => {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new ApiError(404, "Preview asset not found");
  }
  if (asset.deletedAt) {
    throw new ApiError(400, "Preview asset is deleted");
  }

  // রুল ক: গেস্ট ইউজারের আপলোড করা কোনো অ্যাসেট টেমপ্লেট প্রিভিউ হতে পারবে না
  if (asset.guestSessionId) {
    throw new ApiError(403, "Guest assets cannot be used as template preview");
  }

  // রুল খ: অ্যাসেটটি যদি কোনো নির্দিষ্ট ইউজারের প্রাইভেট অ্যাসেট হয়
  if (asset.ownerUserId) {
    // ক্রিয়েটর যদি লগইন না থাকে, তবে প্রাইভেট অ্যাসেট ব্যবহারের অনুমতি নেই
    if (!userId) {
      throw new ApiError(401, "Authentication required to use user-owned preview asset");
    }
    // অন্য ইউজারের প্রাইভেট অ্যাসেট ব্যবহার করা সম্পূর্ণ নিষিদ্ধ
    if (asset.ownerUserId !== userId) {
      throw new ApiError(403, "Cannot use another user's private asset as preview");
    }
  }
};

const createTemplate = async (data: ICreateTemplateInput, userId?: string) => {
  const category = await prisma.templateCategory.findUnique({
    where: { id: data.categoryId },
  });
  if (!category) throw new ApiError(404, "Category not found");
  if (!category.isActive) throw new ApiError(400, "Category is inactive");

  if (data.previewAssetId) {
    await validatePreviewAsset(data.previewAssetId, userId);
  }

  return prisma.template.create({
    data: { ...data, config: sanitizeConfig(data.config), status: "DRAFT" },
  });
};

// ২. Public Catalog: ACTIVE category PUBLISHED template return
const listTemplates = async (query: IListTemplateQuery) => {
  const where = {
    status: "PUBLISHED" as const,
    // (isActive: true)
    category: {
      isActive: true,
    },
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.accessLevel && { accessLevel: query.accessLevel }),
  };

  const [items, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
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

// ৩. Get Template: Public Isolation ও Hridoy-এর Entitlement Integration Contract
const getTemplateById = async (
  id: string,
  user?: { id: string; role?: string; isPremium?: boolean }
) => {
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
  });

  if (!template) throw new ApiError(404, "Template not found");

  const isCategoryActive = template.category?.isActive ?? true;
  if (user?.role !== "ADMIN" && (template.status !== "PUBLISHED" || !isCategoryActive)) {
    throw new ApiError(404, "Template not found or not published");
  }

  // Dev 7 (Hridoy) Entitlement Contract Integration
  if (template.accessLevel === "PREMIUM") {
    if (user?.role !== "ADMIN") {
      if (!user) {
        throw new ApiError(401, "Authentication required to access premium template");
      }
      
      // Hridoy-এর entitlement contract (user.isPremium বা subscription চেক)
      const hasEntitlement = Boolean(user.isPremium);
      if (!hasEntitlement) {
        throw new ApiError(403, "This is a premium template. Premium entitlement required.");
      }
    }
  }

  return template;
};

const updateTemplate = async (
  id: string,
  data: IUpdateTemplateInput,
  userId?: string
) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Template not found");
  if (template.status === "ARCHIVED") {
    throw new ApiError(400, "Archived template cannot be edited");
  }

  if (data.categoryId) {
    const category = await prisma.templateCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) throw new ApiError(404, "Category not found");
    if (!category.isActive) throw new ApiError(400, "Category is inactive");
  }

  if (data.previewAssetId) {
    await validatePreviewAsset(data.previewAssetId, userId);
  }

  const updateData = data.config
    ? { ...data, config: sanitizeConfig(data.config) }
    : data;

  return prisma.template.update({ where: { id }, data: updateData });
};

const publishTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Template not found");
  if (template.status !== "DRAFT") {
    throw new ApiError(400, "Only draft template can be published");
  }

  const result = configSchema.safeParse(template.config);
  if (!result.success) {
    throw new ApiError(400, "Template config is invalid or in old format");
  }

  return prisma.template.update({
    where: { id },
    data: { status: "PUBLISHED" },
  });
};

const archiveTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Template not found");
  if (template.status !== "PUBLISHED") {
    throw new ApiError(400, "Only published template can be archived");
  }

  return prisma.template.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
};

const unarchiveTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Template not found");
  if (template.status !== "ARCHIVED") {
    throw new ApiError(400, "Only archived template can be restored");
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