import { Request, Response } from "express";
import { ZodIssue } from "zod";
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

const formatIssues = (issues: ZodIssue[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

const extractAuthContext = (req: Request) => {
  const userId = (req as any).user?.id as string | undefined;
  const role = (req as any).user?.role as string | undefined;
  const guestSessionId =
    (req.headers["x-guest-session-id"] as string) || req.cookies?.guest_session_id;
  return { userId, guestSessionId, role };
};

const generateSlogans = asyncHandler(async (req: Request, res: Response) => {
  const parsed = generateSlogansSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const authContext = extractAuthContext(req);
  const data = await aiService.generateSlogans(parsed.data, authContext);

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
  const parsed = createAiTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const authContext = extractAuthContext(req);
  const data = await aiService.enqueueTask(parsed.data, authContext);

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
  const parsed = removeBackgroundSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const authContext = extractAuthContext(req);
  const data = await aiService.enqueueBackgroundRemoval(parsed.data, authContext);

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
  const parsed = getTaskStatusParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new ApiError(400, formatIssues(parsed.error.issues));
  }

  const authContext = extractAuthContext(req);
  const data = await aiService.getTaskById(parsed.data.id, authContext);

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
