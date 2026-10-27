import type { Request, Response } from "express";
import sharp from "sharp";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { prisma } from "../../config/db.js";
import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";
import { cookieOptions } from "../auth/auth.service.js";
import { anonymizeUserAccount } from "./user.service.js";

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
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const roleNames = user.roles?.map((r) => r.role?.name).filter(Boolean) || [];

    return sendResponse(
      res,
      200,
      "User fetched successfully",
      true,
      null,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        avatarAssetId: user.avatarAssetId,
        avatar: user.avatar,
        roles: roleNames,
        roleNames,
      },
    );
  },
);
// PATCH /api/v1/auth/profile
export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    let uploadedPublicId: string | null = null;
    let profileUpdateCommitted = false;

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

      let oldPublicId: string | null = null;

      // Upload new profile image if provided
      if (req.file) {
        const optimizedBuffer = await sharp(req.file.buffer)
          .resize(512, 512, { fit: "cover", position: "centre" })
          .webp({ quality: 85 })
          .toBuffer();

        const uploaded = await uploadOnCloudinary(
          optimizedBuffer,
          "political_posters/user_profiles",
        );

        uploadedPublicId = uploaded.public_id;
        // Find previous image public ID
        if (existingUser.avatarAssetId) {
          const oldAsset = await prisma.asset.findUnique({
            where: { id: existingUser.avatarAssetId },
            select: { storageKey: true },
          });

          oldPublicId = oldAsset?.storageKey ?? null;
        }

        // নতুন Asset ও User-এর avatar relation একই transaction-এ save করি।
        // Database update ব্যর্থ হলে transaction rollback হবে; নতুন Cloudinary file cleanup হবে।
        await prisma.$transaction(async (tx) => {
          const asset = await tx.asset.create({
            data: {
              ownerUserId: existingUser.id,
              purpose: "USER_UPLOAD",
              storageKey: uploaded.public_id,
              mimeType: "image/webp",
              sizeBytes: optimizedBuffer.length,
            },
            select: { id: true },
          });

          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              ...(name !== undefined && { name: name.trim() }),
              avatarAssetId: asset.id,
            },
          });
        });
        profileUpdateCommitted = true;

        // নতুন avatar save হওয়ার পর পুরোনো image cleanup করি।
        if (existingUser.avatarAssetId) {
          try {
            await prisma.asset.delete({
              where: { id: existingUser.avatarAssetId },
            });

            if (oldPublicId) {
              await cloudinary.uploader.destroy(oldPublicId);
            }
          } catch (error) {
            // Cleanup ব্যর্থ হলেও নতুন profile image অক্ষত রাখি।
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
        profileUpdateCommitted = true;
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
      if (uploadedPublicId && !profileUpdateCommitted) {
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

export const deleteCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    await anonymizeUserAccount(req.user.id);

    // Account anonymize সফল হলে user ও guest—দুই cookie-ই clear করি।
    res.clearCookie("token", cookieOptions);
    res.clearCookie("guest_session_id", cookieOptions);

    return sendResponse(
      res,
      200,
      "Account deleted and personal data anonymized",
      true,
      null,
      null,
    );
  },
);