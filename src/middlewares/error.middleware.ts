import type { ErrorRequestHandler } from "express";

export const errorMiddleware: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  const error = err as Error & {
    statusCode?: number;
    errors?: any[];
    code?: string;
    meta?: { target?: unknown };
  };
  let statusCode = error.statusCode ?? 500;
  let message = error.message || "Internal server error";

  // Handle unhandled Prisma unique constraint violations contextually
  if (error.code === "P2002") {
    statusCode = 409;
    const target = error.meta?.target;
    const targetField = Array.isArray(target)
      ? target.join(", ")
      : typeof target === "string"
        ? target
        : null;

    if (targetField && targetField.toLowerCase().includes("email")) {
      message = "এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা হয়েছে।";
    } else if (targetField) {
      message = `A record with this ${targetField} already exists. (প্রদত্ত ${targetField} দিয়ে ইতিমধ্যে একটি রেকর্ড রয়েছে)`;
    } else {
      message = "প্রদত্ত তথ্য দিয়ে ইতিমধ্যে একটি রেকর্ড রয়েছে। (A record with this unique value already exists)";
    }
  }

  console.error("🔥 Global Error Caught:", err);

  res.status(statusCode).json({
    success: false,
    message: message,

    ...(error.errors && error.errors.length > 0 && { errors: error.errors }),
    errorDetails: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};
