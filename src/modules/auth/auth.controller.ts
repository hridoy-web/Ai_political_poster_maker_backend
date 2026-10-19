import type { Request, Response } from "express";

import { prisma } from "../../config/db.js";
import { registerSchema, loginSchema } from "./auth.validation.js";
import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";
import {
  cookieOptions,
  SEVEN_DAYS,
  registerUser,
  loginUser,
} from "./auth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";

// POST /api/v1/auth/register
export const register = asyncHandler(async (req: Request, res: Response) => {
  let uploadedPublicId: string | null = null;

  try {
    // Validate request body
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ApiError(
        400,
        validation.error.issues[0]?.message || "Invalid input",
      );
    }

    const { name, email, password } = validation.data;

    // Upload optional profile image
    let imageUrl: string | null = null;

    if (req.file) {
      const uploaded = await uploadOnCloudinary(
        req.file.buffer,
        "political_posters/user_profiles",
      );

      imageUrl = uploaded.secure_url;
      uploadedPublicId = uploaded.public_id;
    }

    // Register user through service
    const user = await registerUser(name, email, password);

    // Create Asset record
    if (req.file && imageUrl && uploadedPublicId) {
      const asset = await prisma.asset.create({
        data: {
          ownerUserId: user.id,
          purpose: "USER_UPLOAD",
          storageKey: uploadedPublicId,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
        select: {
          id: true,
        },
      });

      // Connect Asset to User
      await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarAssetId: asset.id,
        },
      });
    }

    return sendResponse(
      res,
      201,
      "User registered successfully",
      true,
      null,
      user,
    );
  } catch (error) {
    // Clean up uploaded image if registration fails
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError);
      }
    }

    throw error;
  }
});

// POST /api/v1/auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    throw new ApiError(
      400,
      validation.error.issues[0]?.message || "Invalid input",
    );
  }

  const { email, password } = validation.data;

  // Login through service
  const result = await loginUser(email, password);

  // Set cookie
  res.cookie("token", result.token, {
    ...cookieOptions,
    maxAge: SEVEN_DAYS,
  });

  return sendResponse(res, 200, "Login successful", true, null, result);
});

// POST /api/v1/auth/logout
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Clear cookie
  res.clearCookie("token", cookieOptions);

  return sendResponse(res, 200, "Logged out successfully", true, null, null);
});
