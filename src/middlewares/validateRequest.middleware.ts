import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const validateRequest = (schema: ZodType) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const parsed = await schema.safeParseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!parsed.success) {
      const errorMessage =
        parsed.error.issues[0]?.message || 'Invalid input data';
      throw new ApiError(400, errorMessage);
    }

    const data = parsed.data as {
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
    };

    if (data?.body !== undefined) {
      req.body = data.body;
    }

    next();
  });
};