import { Response } from "express";

interface IApiResponse<T> {
  statusCode: number;
  success: boolean;
  message?: string;
  data?: T | null;
}

const sendResponse = <T>(res: Response, data: IApiResponse<T>): void => {
  res.status(data.statusCode).json({
    success: data.success,
    message: data.message || "Success",
    data: data.data || null,
  });
};

export default sendResponse;