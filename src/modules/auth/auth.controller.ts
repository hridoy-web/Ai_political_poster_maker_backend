import type { Request, Response } from "express";
import sharp from "sharp";

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
    // Password-সহ request body log করি না।
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ApiError(
        400,
        validation.error.issues[0]?.message || "Invalid input",
      );
    }

    const { name, email, password } = validation.data;

    let avatar:
      | {
          storageKey: string;
          mimeType: string;
          sizeBytes: number;
        }
      | undefined;

    if (req.file) {
      let processedImage: Buffer;

      try {
        // যেকোনো মাপের profile image-কে 512×512 square WebP করি।
        // ছবির মাঝখান crop হবে।
        processedImage = await sharp(req.file.buffer)
          .resize(512, 512, {
            fit: "cover",
            position: "centre",
          })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        throw new ApiError(400, "Invalid profile image");
      }

      // Cloudinary-তে original file-এর বদলে processed image পাঠাই।
      const uploaded = await uploadOnCloudinary(
        processedImage,
        "political_posters/user_profiles",
      );

      uploadedPublicId = uploaded.public_id;

      // Service এই তথ্য দিয়ে User, Asset ও avatar relation save করে।
      avatar = {
        storageKey: uploaded.public_id,
        mimeType: "image/webp",
        sizeBytes: processedImage.length,
      };
    }

    const user = await registerUser(name, email, password, avatar);

    return sendResponse(
      res,
      201,
      "User registered successfully",
      true,
      null,
      user,
    );
  } catch (error) {
    // Registration ব্যর্থ হলে Cloudinary-তে ওঠা ছবিটি মুছে দিই।
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupError) {
        // Cleanup error log করি; password বা request body log করি না।
        console.error("Cloudinary image cleanup failed:", cleanupError);
      }
    }

    throw error;
  }
});

// POST /api/v1/auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    throw new ApiError(
      400,
      validation.error.issues[0]?.message || "Invalid input",
    );
  }

  const { email, password } = validation.data;

  // Browser-এর guest token service-এ পাঠাই; service token যাচাই করে data claim করে।
  const result = await loginUser(
    email,
    password,
    req.cookies?.guest_session_id,
  );

  res.cookie("token", result.token, {
    ...cookieOptions,
    maxAge: SEVEN_DAYS,
  });

  // Login সফল হওয়ার পর পুরোনো guest cookie সরিয়ে দিই।
  res.clearCookie("guest_session_id", cookieOptions);

  return sendResponse(res, 200, "Login successful", true, null, result);
});

// POST /api/v1/auth/logout
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie("token", cookieOptions);

  return sendResponse(
    res,
    200,
    "Logged out successfully",
    true,
    null,
    null,
  );
});