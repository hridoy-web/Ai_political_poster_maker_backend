import { Request, Response } from "express";
import { ZodSchema, ZodIssue } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { aiService } from "./ai.service.js";
import {
  generateSlogansSchema,
  getTaskStatusParamsSchema,
  createAiTaskSchema,
  removeBackgroundSchema,
} from "./ai.validation.js";

const formatIssues = (issues: ZodIssue[]): string =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

const validateData = <T>(schema: ZodSchema<T>, data: unknown): T => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }
  return parsed.data;
};

const extractAuthContext = (req: Request) => {
  const userId = (req as any).user?.id as string | undefined;
  const role = (req as any).user?.role as string | undefined;

  // Guest ID middleware-এ যাচাই হয়ে request-এ এসেছে।
  const guestSessionId = req.guestSessionId;

  return { userId, guestSessionId, role };
};

const generateSlogans = asyncHandler(async (req: Request, res: Response) => {
  const input = validateData(generateSlogansSchema, req.body);
  const data = await aiService.generateSlogans(input, extractAuthContext(req));

  sendResponse(
    res,
    201,
    "Slogans generated successfully",
    true,
    null,
    data
  );
});

const createTask = asyncHandler(async (req: Request, res: Response) => {
  const input = validateData(createAiTaskSchema, req.body);
  const data = await aiService.enqueueTask(input, extractAuthContext(req));

  sendResponse(
    res,
    202,
    "AI task enqueued successfully",
    true,
    null,
    data
  );
});

const removeBackground = asyncHandler(async (req: Request, res: Response) => {
  const input = validateData(removeBackgroundSchema, req.body);
  const data = await aiService.enqueueBackgroundRemoval(input, extractAuthContext(req));

  sendResponse(
    res,
    202,
    "Background removal task enqueued successfully",
    true,
    null,
    data
  );
});

const getTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validateData(getTaskStatusParamsSchema, req.params);
  const data = await aiService.getTaskById(id, extractAuthContext(req));

  sendResponse(
    res,
    200,
    "AI task status fetched successfully",
    true,
    null,
    data
  );
});

export const aiController = {
  generateSlogans,
  createTask,
  removeBackground,
  getTaskStatus,
};
