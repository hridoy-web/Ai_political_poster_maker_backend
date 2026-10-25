import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod/v3';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const validateRequest = (schema: AnyZodObject) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const parsed = await schema.safeParseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid input data'
      );
    }

    req.body = parsed.data.body;
    next();
  });
};