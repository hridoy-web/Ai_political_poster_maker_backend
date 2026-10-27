import type { RequestHandler } from "express";

export const notFoundMiddleware: RequestHandler = (req, res, next) => {

  if (req.originalUrl === "/favicon.ico") {
    res.status(204).end();
    return;
  }

  const error = Object.assign(
    new Error(`Route not found: ${req.method} ${req.originalUrl}`),
    { statusCode: 404 },
  );

  next(error);
};