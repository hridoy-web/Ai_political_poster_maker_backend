import type { RequestHandler } from "express";

export const notFoundMiddleware: RequestHandler = (req, _res, next) => {
  const error = Object.assign(
    new Error(`Route not found: ${req.method} ${req.originalUrl}`),
    { statusCode: 404 },
  );

  next(error);
};