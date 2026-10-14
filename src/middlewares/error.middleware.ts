import type { ErrorRequestHandler } from "express";

export const errorMiddleware: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  const error = err as Error & { statusCode?: number };
  const statusCode = error.statusCode ?? 500;

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal server error" : error.message,
  });
};