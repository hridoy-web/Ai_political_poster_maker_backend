import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  let { statusCode = 500, message = 'Internal Server Error' } = err;

  if (!(err instanceof ApiError)) {
    statusCode = 500;
    message = err.message || 'Something went wrong';
  }

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};

export { errorHandler };