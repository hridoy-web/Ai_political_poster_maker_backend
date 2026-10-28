import type { Request, Response } from "express";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { prisma } from "../../config/db.js";
import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";
import { cookieOptions, hashPassword } from "../auth/auth.service.js";
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
        title: true,
        area: true,
        userProfile: true,
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

    let phone = "";
    if (user.userProfile) {
      try {
        const parsed = JSON.parse(user.userProfile);
        phone = parsed.phone || "";
      } catch {
        phone = user.userProfile;
      }
    }

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
        phone,
        title: user.title,
        area: user.area,
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

      const { name, phone, title, area } = req.body;

      // Validate name if provided
      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          throw new ApiError(400, "Name cannot be empty");
        }
      }

      if (
        name === undefined &&
        phone === undefined &&
        title === undefined &&
        area === undefined &&
        !req.file
      ) {
        throw new ApiError(400, "Provide profile fields or profile image to update");
      }

      // Find existing user
      const existingUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          userProfile: true,
          avatarAssetId: true,
        },
      });

      if (!existingUser) {
        throw new ApiError(404, "User not found");
      }

      let updatedUserProfile: string | undefined = undefined;
      if (phone !== undefined) {
        let existingObj: Record<string, any> = {};
        if (existingUser.userProfile) {
          try {
            existingObj = JSON.parse(existingUser.userProfile);
          } catch {
            existingObj = { bio: existingUser.userProfile };
          }
        }
        existingObj.phone = String(phone).trim();
        updatedUserProfile = JSON.stringify(existingObj);
      }

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (title !== undefined) updateData.title = String(title).trim();
      if (area !== undefined) updateData.area = String(area).trim();
      if (updatedUserProfile !== undefined) updateData.userProfile = updatedUserProfile;

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

        // Save new Asset and User update in transaction
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
              ...updateData,
              avatarAssetId: asset.id,
            },
          });
        });
        profileUpdateCommitted = true;

        // Cleanup old image if exists
        if (existingUser.avatarAssetId) {
          try {
            await prisma.asset.delete({
              where: { id: existingUser.avatarAssetId },
            });

            if (oldPublicId) {
              await cloudinary.uploader.destroy(oldPublicId);
            }
          } catch (error) {
            console.error("Old profile image cleanup error:", error);
          }
        }
      } else {
        // Update profile fields only
        if (Object.keys(updateData).length > 0) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: updateData,
          });
        }
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
          title: true,
          area: true,
          userProfile: true,
          avatarAssetId: true,
          avatar: true,
        },
      });

      let responsePhone = "";
      if (updatedUser?.userProfile) {
        try {
          const parsed = JSON.parse(updatedUser.userProfile);
          responsePhone = parsed.phone || "";
        } catch {
          responsePhone = updatedUser.userProfile;
        }
      }

      return sendResponse(
        res,
        200,
        "Profile updated successfully",
        true,
        null,
        {
          ...updatedUser,
          phone: responsePhone,
        },
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

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "বর্তমান পাসওয়ার্ড এবং নতুন পাসওয়ার্ড উভয়ই প্রদান করুন");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new ApiError(404, "ব্যবহারকারী খুঁজে পাওয়া যায়নি");
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      throw new ApiError(400, "বর্তমান পাসওয়ার্ড সঠিক নয়");
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw new ApiError(400, "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে");
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return sendResponse(
      res,
      200,
      "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে",
      true,
      null,
      null,
    );
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