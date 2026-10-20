import { Request, Response, NextFunction } from "express";
import { aiService } from "./ai.service.js";
import {
  generateSlogansSchema,
  getTaskStatusParamsSchema,
} from "./ai.validation.js";

type HttpError = Error & { statusCode?: number };

const badRequest = (message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = 400;
  return error;
};

const formatIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

const extractAuthContext = (req: Request) => {
  const userId = (req as any).user?.id as string | undefined;
  const guestSessionId = (req.headers["x-guest-session-id"] as string) || req.cookies?.guest_session_id;
  return { userId, guestSessionId };
};

const generateSlogans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = generateSlogansSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(badRequest(formatIssues(parsed.error.issues)));
    }

    const authContext = extractAuthContext(req);
    const data = await aiService.generateSlogans(parsed.data, authContext);

    res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

const getTaskStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = getTaskStatusParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(badRequest(formatIssues(parsed.error.issues)));
    }

    const data = await aiService.getTaskById(parsed.data.id);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const aiController = {
  generateSlogans,
  getTaskStatus,
};
