import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { prisma } from "../../config/db.js";
import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";

export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        avatarAssetId: true,
        avatar: true,
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return sendResponse(
      res,
      200,
      "User fetched successfully",
      true,
      null,
      user,
    );
  },
);
// PATCH /api/v1/auth/profile
export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    let uploadedPublicId: string | null = null;

    try {
      if (!req.user) {
        throw new ApiError(401, "Unauthorized");
      }

      const { name } = req.body;

      // Validate name
      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          throw new ApiError(400, "Name cannot be empty");
        }
      }

      if (name === undefined && !req.file) {
        throw new ApiError(400, "Provide name or profile image to update");
      }

      // Find existing user
      const existingUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          avatarAssetId: true,
        },
      });

      if (!existingUser) {
        throw new ApiError(404, "User not found");
      }

      let avatarAssetId = existingUser.avatarAssetId;
      let oldPublicId: string | null = null;

      // Upload new profile image if provided
      if (req.file) {
        const uploaded = await uploadOnCloudinary(
          req.file.buffer,
          "political_posters/user_profiles",
        );

        uploadedPublicId = uploaded.public_id;

        // Create new Asset record
        const asset = await prisma.asset.create({
          data: {
            ownerUserId: existingUser.id,
            purpose: "USER_UPLOAD",
            storageKey: uploaded.public_id,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
          },
          select: {
            id: true,
          },
        });

        avatarAssetId = asset.id;

        // Update user profile
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            ...(name !== undefined && { name: name.trim() }),
            avatarAssetId,
          },
        });

        // Find previous image public ID
        if (existingUser.avatarAssetId) {
          const oldAsset = await prisma.asset.findUnique({
            where: { id: existingUser.avatarAssetId },
            select: { storageKey: true },
          });

          oldPublicId = oldAsset?.storageKey ?? null;
        }

        // Delete old Asset record after successful profile update
        if (existingUser.avatarAssetId) {
          await prisma.asset.delete({
            where: { id: existingUser.avatarAssetId },
          });
        }

        // Delete old image from Cloudinary
        if (oldPublicId) {
          try {
            await cloudinary.uploader.destroy(oldPublicId);
          } catch (error) {
            console.error("Old profile image cleanup error:", error);
          }
        }
      } else {
        // Update name only
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: name.trim(),
          },
        });
      }

      // Fetch updated user
      const updatedUser = await prisma.user.findUnique({
        where: { id: existingUser.id },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          avatarAssetId: true,
          avatar: true,
        },
      });

      return sendResponse(
        res,
        200,
        "Profile updated successfully",
        true,
        null,
        updatedUser,
      );
    } catch (error) {
      // Clean up newly uploaded image if update fails
      if (uploadedPublicId) {
        try {
          await cloudinary.uploader.destroy(uploadedPublicId);
        } catch (cleanupError) {
          console.error("Cloudinary cleanup error:", cleanupError);
        }
      }

      throw error;
    }
  },
);
