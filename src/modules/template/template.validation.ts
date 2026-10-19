import { z } from "zod";

const fieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Invalid field key"),
  type: z.enum(["text", "image"]),
  label: z.string().min(1).max(50),
  default: z.string().max(200).optional(),
});

export const configSchema = z
  .object({
    type: z.literal("html"),
    html: z.string().min(1).max(50_000),
    css: z.string().max(20_000).default(""),
    fields: z.array(fieldSchema).max(30),
  })
  .superRefine((cfg, ctx) => {
    const usedPlaceholders = [...cfg.html.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
    const usedDataFields = [...cfg.html.matchAll(/data-field="(\w+)"/g)].map((m) => m[1]);

    const defined = new Set(cfg.fields.map((f) => f.key));
    for (const key of [...usedPlaceholders, ...usedDataFields]) {
      if (!defined.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Field "${key}" is used in html but not defined in fields`,
        });
      }
    }
  });

export const createTemplateSchema = z.object({
  categoryId: z.string().uuid("categoryId must be a valid id"),
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(100),
  description: z.string().trim().max(500).optional(),
  accessLevel: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  aspectRatio: z.string().default("4:5"),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1350),
  config: configSchema,
  previewAssetId: z.string().uuid().optional(),
});

export const updateTemplateSchema = z
  .object({
    categoryId: z.string().uuid("categoryId must be a valid id"),
    title: z.string().trim().min(2, "Title must be at least 2 characters").max(100),
    description: z.string().trim().max(500).nullable(),
    accessLevel: z.enum(["FREE", "PREMIUM"]),
    aspectRatio: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    config: configSchema,
    previewAssetId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required",
  });

export const listTemplateQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  accessLevel: z.enum(["FREE", "PREMIUM"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});