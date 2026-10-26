import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { uploadImageService, deleteAssetService } from "./upload.service.js";

export const uploadController = asyncHandler(async (req: Request, res: Response) => {
  // Trust only identity verified by middleware, never owner IDs from the request body.
  const ownerUserId = req.user?.id;
  const guestSessionId = req.guestSessionId;

  if (!ownerUserId && !guestSessionId) {
    throw new ApiError(401, "A verified user or guest session is required");
  }

  const asset = await uploadImageService(req.file, {
    purpose: req.body?.purpose || "USER_UPLOAD",
    ownerUserId,
    guestSessionId,
  });

  return sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Image processed, uploaded, and asset recorded successfully.",
    data: asset,
  });
});

export const deleteAssetController = asyncHandler(
  async (req: Request, res: Response) => {
    const rawAssetId = req.params.id;
    const assetId = Array.isArray(rawAssetId) ? rawAssetId[0] : rawAssetId;

    if (!assetId) {
      throw new ApiError(400, "Asset ID is required");
    }

    // The service checks asset ownership against the verified request identity.
    const deletedAsset = await deleteAssetService(
      assetId,
      req.user?.id,
      req.guestSessionId,
    );

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Asset deleted successfully.",
      data: deletedAsset,
    });
  },
);
