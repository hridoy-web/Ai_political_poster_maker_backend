import { z } from "zod";

/**
 * Validates an attached photo/logo asset with its slot position.
 */
export const sourceAssetItemSchema = z.object({
  assetId: z.string().uuid("assetId must be a valid UUID"),
  position: z.number().int().min(1, "position must be an integer >= 1"),
});

/**
 * Validates POST /api/v1/posters (creating a new poster draft)
 */
export const createPosterSchema = z
  .object({
    templateId: z.string().uuid("templateId must be a valid UUID"),
    idempotencyKey: z
      .string()
      .trim()
      .min(5, "idempotencyKey must be at least 5 characters")
      .max(100, "idempotencyKey must be at most 100 characters")
      .optional(),
    inputData: z
      .record(z.string(), z.unknown())
      .refine(
        (data) => Object.keys(data).length > 0,
        "inputData must contain at least one field"
      ),
    sourceAssets: z
      .array(sourceAssetItemSchema)
      .max(10, "Maximum 10 source assets allowed per poster")
      .optional()
      .default([]),
  })
  .superRefine((data, ctx) => {
    // Ensure no two assets share the same position slot
    if (data.sourceAssets && data.sourceAssets.length > 1) {
      const positions = new Set<number>();
      for (const item of data.sourceAssets) {
        if (positions.has(item.position)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate position slot ${item.position} in sourceAssets`,
            path: ["sourceAssets"],
          });
          break;
        }
        positions.add(item.position);
      }
    }
  });

/**
 * Validates PATCH /api/v1/posters/:id (updating a draft)
 */
export const updatePosterSchema = z
  .object({
    templateId: z.string().uuid("templateId must be a valid UUID").optional(),
    inputData: z.record(z.string(), z.unknown()).optional(),
    sourceAssets: z.array(sourceAssetItemSchema).max(10).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field (templateId, inputData, or sourceAssets) must be provided"
  )
  .superRefine((data, ctx) => {
    if (data.sourceAssets && data.sourceAssets.length > 1) {
      const positions = new Set<number>();
      for (const item of data.sourceAssets) {
        if (positions.has(item.position)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate position slot ${item.position} in sourceAssets`,
            path: ["sourceAssets"],
          });
          break;
        }
        positions.add(item.position);
      }
    }
  });

/**
 * Validates GET /api/v1/posters (list query filters & pagination)
 */
export const listPosterQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be >= 1").default(1),
  limit: z.coerce.number().int().min(1).max(50, "Limit cannot exceed 50").default(10),
  status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DELETED"])
    .optional(),
  templateId: z.string().uuid("templateId must be a valid UUID").optional(),
});

/**
 * Validates :id URL parameter
 */
export const posterIdParamSchema = z.object({
  id: z.string().uuid("Poster ID must be a valid UUID"),
});

/**
 * Validates POST /api/v1/posters/:id/render
 */
export const renderPosterSchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(5)
    .max(100)
    .optional(),
  rendererVersion: z.string().trim().max(20).default("1.0.0"),
});
