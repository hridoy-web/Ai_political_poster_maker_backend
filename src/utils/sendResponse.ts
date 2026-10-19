import type { Response } from "express";

const sendResponse = <T>(
  res: Response,
  statusCode: number,
  message: string,
  success: boolean,
  error: unknown = null,
  data: T | null = null,
): void => {
  res.status(statusCode).json({
    success,
    message,
    error,
    data,
  });
};

export default sendResponse;
