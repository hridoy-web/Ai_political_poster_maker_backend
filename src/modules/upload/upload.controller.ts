import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { uploadImageService, validateAssetAccess, deleteAssetService } from "./upload.service.js";

export const uploadController = asyncHandler(async (req: Request, res: Response) => {
  const ownerUserId = req.user?.id || req.body?.ownerUserId;
  const guestSessionId = req.guestSessionId || req.body?.guestSessionId;
  const purpose = req.body?.purpose || "USER_UPLOAD";

  if (!ownerUserId && !guestSessionId) {
    throw new ApiError(401, "A verified user or guest session is required");
  }

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

export const verifyAssetOwner = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const rawAssetId = req.params.id;
  const assetId = typeof rawAssetId === "string" ? rawAssetId : Array.isArray(rawAssetId) ? rawAssetId[0] : "";

  const rawUserId = req.user?.id || req.body?.ownerUserId || req.query?.ownerUserId;
  const userId = typeof rawUserId === "string" ? rawUserId : Array.isArray(rawUserId) ? rawUserId[0] : undefined;

  const rawGuestSessionId = req.guestSessionId || req.body?.guestSessionId || req.query?.guestSessionId;
  const guestSessionId = typeof rawGuestSessionId === "string" ? rawGuestSessionId : Array.isArray(rawGuestSessionId) ? rawGuestSessionId[0] : undefined;

  await validateAssetAccess(assetId, userId, guestSessionId);
  next();
});

export const deleteAssetController = asyncHandler(async (req: Request, res: Response) => {
  const rawAssetId = req.params.id;
  const assetId = typeof rawAssetId === "string" ? rawAssetId : Array.isArray(rawAssetId) ? rawAssetId[0] : "";

  const rawUserId = req.user?.id || req.body?.ownerUserId;
  const userId = typeof rawUserId === "string" ? rawUserId : Array.isArray(rawUserId) ? rawUserId[0] : undefined;

  const rawGuestSessionId = req.guestSessionId || req.body?.guestSessionId;
  const guestSessionId = typeof rawGuestSessionId === "string" ? rawGuestSessionId : Array.isArray(rawGuestSessionId) ? rawGuestSessionId[0] : undefined;

  const deletedAsset = await deleteAssetService(assetId, userId, guestSessionId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Asset deleted successfully.",
    data: deletedAsset,
  });
});