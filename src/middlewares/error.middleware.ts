import type { ErrorRequestHandler } from "express";

export const errorMiddleware: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  const error = err as Error & { statusCode?: number; errors?: any[]; code?: string };
  let statusCode = error.statusCode ?? 500;
  let message = error.message || "Internal server error";

  // Handle unhandled Prisma unique constraint violations cleanly
  if (error.code === "P2002") {
    statusCode = 409;
    message = "এই তথ্য (ইমেইল) দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা হয়েছে।";
  }

  console.error("🔥 Global Error Caught:", err);

  res.status(statusCode).json({
    success: false,
    message: message,

    ...(error.errors && error.errors.length > 0 && { errors: error.errors }),
    errorDetails: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};