import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const validateRequest = (schema: ZodTypeAny) => {
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

    const data = parsed.data as { body?: any; query?: any; params?: any };
    if (data?.body !== undefined) {
      req.body = data.body;
    }
    next();
  });
};