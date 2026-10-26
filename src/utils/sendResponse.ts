import type { Response } from "express";

export interface IApiResponse<T> {
  statusCode: number;
  success: boolean;
  message?: string;
  error?: unknown;
  data?: T | null;
}

function sendResponse<T>(res: Response, data: IApiResponse<T>): void;
function sendResponse<T>(
  res: Response,
  statusCode: number,
  message: string,
  success: boolean,
  error?: unknown,
  data?: T | null
): void;
function sendResponse<T>(
  res: Response,
  statusCodeOrPayload: number | IApiResponse<T>,
  message?: string,
  success?: boolean,
  error: unknown = null,
  data: T | null = null
): void {
  if (typeof statusCodeOrPayload === "object" && statusCodeOrPayload !== null) {
    const payload = statusCodeOrPayload;
    res.status(payload.statusCode).json({
      success: payload.success,
      message: payload.message || "Success",
      error: payload.error || null,
      data: payload.data || null,
    });
    return;
  }

  res.status(statusCodeOrPayload).json({
    success: Boolean(success),
    message: message || "Success",
    error,
    data,
  });
}

export default sendResponse;
