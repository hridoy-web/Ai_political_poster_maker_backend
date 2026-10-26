import type { ErrorRequestHandler } from "express";

export const errorMiddleware: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  const error = err as Error & { statusCode?: number; errors?: any[] };
  const statusCode = error.statusCode ?? 500;
  const message = error.message || "Internal server error";


  console.error("🔥 Global Error Caught:", err);

  res.status(statusCode).json({
    success: false,
    message: message,

    ...(error.errors && error.errors.length > 0 && { errors: error.errors }),
    errorDetails: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};