import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { uploadImageService } from "./upload.service.js";

export const uploadController = asyncHandler(async (req: Request, res: Response) => {
  const ownerUserId = req.user?.id || req.body?.ownerUserId;
  const purpose = req.body?.purpose || "USER_UPLOAD";
  const guestSessionId = req.body?.guestSessionId;

  const asset = await uploadImageService(req.file, {
    purpose,
    ownerUserId,
    guestSessionId,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Image processed, uploaded, and asset recorded successfully.",
    data: asset,
  });
});