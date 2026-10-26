import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { posterService } from "./poster.service.js";
import type { IPosterOwnerContext } from "./poster.interface.js";
import {
  createPosterSchema,
  updatePosterSchema,
  listPosterQuerySchema,
  posterIdParamSchema,
  renderPosterSchema,
} from "./poster.validation.js";

/**
 * Clean generic parser: parses data against any Zod schema.
 * Throws 400 ApiError with human-readable error messages on failure.
 */
function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`)
      .join(", ");
    throw new ApiError(400, message);
  }
  return result.data;
}

// Owner identity is verified by shared middleware and stored on the request.
function getOwnerContext(req: Request): IPosterOwnerContext {
  return {
    userId: req.user?.id,
    guestSessionId: req.guestSessionId,
  };
}
}

// 1. POST /api/v1/posters - Create new poster draft
const createPoster = asyncHandler(async (req: Request, res: Response) => {
  const data = validate(createPosterSchema, req.body);
  const result = await posterService.createPoster(getOwnerContext(req), data);
  sendResponse(res, 201, "Poster draft created successfully", true, null, result);
});

// 2. GET /api/v1/posters - List caller's posters with pagination
const listPosters = asyncHandler(async (req: Request, res: Response) => {
  const query = validate(listPosterQuerySchema, req.query);
  const result = await posterService.listPosters(getOwnerContext(req), query);

  res.status(200).json({
    success: true,
    message: "Posters fetched successfully",
    data: result.items,
    meta: result.meta,
  });
});

// 3. GET /api/v1/posters/:id - Get poster details
const getPosterById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validate(posterIdParamSchema, req.params);
  const result = await posterService.getPosterById(getOwnerContext(req), id);
  sendResponse(res, 200, "Poster fetched successfully", true, null, result);
});

// 4. PATCH /api/v1/posters/:id - Update draft
const updatePoster = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validate(posterIdParamSchema, req.params);
  const data = validate(updatePosterSchema, req.body);
  const result = await posterService.updatePoster(getOwnerContext(req), id, data);
  sendResponse(res, 200, "Poster updated successfully", true, null, result);
});

// 5. DELETE /api/v1/posters/:id - Soft-delete poster
const deletePoster = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validate(posterIdParamSchema, req.params);
  const result = await posterService.deletePoster(getOwnerContext(req), id);
  sendResponse(res, 200, "Poster deleted successfully", true, null, result);
});

// 6. POST /api/v1/posters/:id/duplicate - Duplicate draft
const duplicatePoster = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validate(posterIdParamSchema, req.params);
  const result = await posterService.duplicatePoster(getOwnerContext(req), id);
  sendResponse(res, 201, "Poster duplicated successfully", true, null, result);
});

// 7. POST /api/v1/posters/:id/render - Trigger render job
const triggerRender = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validate(posterIdParamSchema, req.params);
  const input = validate(renderPosterSchema, req.body);
  const idempotencyKey =
    input.idempotencyKey ||
    (req.headers["idempotency-key"] as string) ||
    (req.headers["x-idempotency-key"] as string);

  const result = await posterService.triggerRender(getOwnerContext(req), id, {
    ...input,
    idempotencyKey,
  });
  sendResponse(res, 202, "Poster render job accepted", true, null, result);
});

// 8. GET /api/v1/posters/:id/status - Polling render progress
const getPosterStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validate(posterIdParamSchema, req.params);
  const result = await posterService.getPosterStatus(getOwnerContext(req), id);
  sendResponse(res, 200, "Poster status fetched successfully", true, null, result);
});

export const posterController = {
  createPoster,
  listPosters,
  getPosterById,
  updatePoster,
  deletePoster,
  duplicatePoster,
  triggerRender,
  getPosterStatus,
};
