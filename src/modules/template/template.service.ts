import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { cleanTemplateHtml, cleanTemplateCss } from "../../lib/sanitizeHtml.js";
import { configSchema } from "./template.validation.js";
import { BillingService } from "../payment/billing.service.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";
import type {
  ICreateTemplateInput,
  IUpdateTemplateInput,
  IListTemplateQuery,
} from "./template.interface.js";

const uploadBase64ToCloudinary = async (
  dataUrl: string,
  folder = "political_templates"
): Promise<string> => {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }
  try {
    const base64Data = dataUrl.split(";base64,").pop();
    if (!base64Data) return dataUrl;
    const buffer = Buffer.from(base64Data, "base64");
    const result = await uploadOnCloudinary(buffer, folder);
    return result.secure_url;
  } catch (err) {
    console.error("Cloudinary upload failed for template image, keeping original:", err);
    return dataUrl;
  }
};

const sanitizeConfig = (config: any) => {
  if (config?.type === "canvas") {
    return {
      ...config,
      blankTemplateUrl: typeof config.blankTemplateUrl === "string" ? config.blankTemplateUrl.trim() : "",
      previewUrl: typeof config.previewUrl === "string" ? config.previewUrl.trim() : undefined,
    };
  }
  return {
    ...config,
    html: cleanTemplateHtml(config?.html ?? ""),
    css: cleanTemplateCss(config?.css ?? ""),
  };
};

// Dev 8: Asset Ownership, Guest & Visibility Check
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

 
  if (asset.guestSessionId) {
    throw new ApiError(403, "Guest assets cannot be used as template preview");
  }


  if (asset.ownerUserId) {
    if (!userId) {
      throw new ApiError(401, "Authentication required to use private asset");
    }
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

  let config = sanitizeConfig(data.config);
  if (config?.type === "canvas") {
    if (config.blankTemplateUrl?.startsWith("data:image/")) {
      config.blankTemplateUrl = await uploadBase64ToCloudinary(
        config.blankTemplateUrl,
        "political_templates/canvas"
      );
    }
    if (config.previewUrl?.startsWith("data:image/")) {
      config.previewUrl = await uploadBase64ToCloudinary(
        config.previewUrl,
        "political_templates/previews"
      );
    }
  }

  return prisma.template.create({
    data: { ...data, config, status: "DRAFT" },
  });
};

// Public Catalog Isolation
const listTemplates = async (query: IListTemplateQuery) => {
  const where = {
    status: "PUBLISHED" as const,
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

  // Catalog isolation: optimize items payload by only returning previewUrl & lightweight config
  const sanitizedItems = items.map((item) => {
    const cfg = (item.config ?? {}) as any;
    const previewUrl =
      cfg.previewUrl ||
      (!cfg.blankTemplateUrl?.startsWith("data:") ? cfg.blankTemplateUrl : undefined);

    return {
      ...item,
      config: {
        type: cfg.type,
        previewUrl,
        fields: cfg.fields,
      },
    };
  });

  return {
    items: sanitizedItems,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

//BillingService.getEntitlements 
const getTemplateById = async (
  id: string,
  user?: { id: string; role?: string }
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
  if (user?.role !== "SUPER_ADMIN" && (template.status !== "PUBLISHED" || !isCategoryActive)) {
    throw new ApiError(404, "Template not found or not published");
  }

  // Premium Access Check via Hridoy's BillingService
  if (template.accessLevel === "PREMIUM") {
    if (user?.role !== "SUPER_ADMIN") {
      if (!user?.id) {
        throw new ApiError(401, "Authentication required to access premium template");
      }

      const entitlements = await BillingService.getEntitlements(user.id);
      if (!entitlements.features.premiumAccess) {
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

  let config = data.config ? sanitizeConfig(data.config) : undefined;
  if (config?.type === "canvas") {
    if (config.blankTemplateUrl?.startsWith("data:image/")) {
      config.blankTemplateUrl = await uploadBase64ToCloudinary(
        config.blankTemplateUrl,
        "political_templates/canvas"
      );
    }
    if (config.previewUrl?.startsWith("data:image/")) {
      config.previewUrl = await uploadBase64ToCloudinary(
        config.previewUrl,
        "political_templates/previews"
      );
    }
  }

  const updateData = config ? { ...data, config } : data;

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

const deleteTemplate = async (id: string) => {
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          posters: true,
        },
      },
    },
  });

  if (!template) {
    throw new ApiError(404, "Template not found");
  }

  // If posters already reference this template, archive it to preserve user history
  if (template._count.posters > 0) {
    return prisma.template.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
  }

  // Otherwise, safely hard delete the template
  return prisma.template.delete({
    where: { id },
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
  deleteTemplate,
};