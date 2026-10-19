import type { Request, Response } from "express";

export const uploadController = (
  req: Request,
  res: Response,
): void => {
  if (!req.file) {
    res.status(400).json({ message: "Image file is required." });
    return;
  }

  res.status(200).json({
    message: "Image received successfully.",
    file: {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
};