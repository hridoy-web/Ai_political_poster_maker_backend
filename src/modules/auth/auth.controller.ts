import type { Request, Response } from "express";
import bcrypt from "bcryptjs";

import { prisma } from "../../config/db.js";
import { registerSchema, loginSchema } from "./auth.validation.js";
import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";
import { cookieOptions, generateToken, SEVEN_DAYS } from "./auth.service.js";
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

    // Check existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError(409, "User already exists with this email");
    }

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

    // Hash password
    const saltRounds = Number(process.env.SALT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Create Asset record
    let assetId: string | null = null;

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
          storageKey: true,
        },
      });

      assetId = asset.id;

      // Connect Asset to User
      await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarAssetId: assetId,
        },
      });
    }

    // Return response
    return sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "User registered successfully",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    // Clean up uploaded image if registration fails
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError);
      }
    }

    // errorHandler e pathao
    throw error;
  }
});

// POST /api/v1/auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  // Zod validation
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    throw new ApiError(
      400,
      validation.error.issues[0]?.message || "Invalid input",
    );
  }

  const { email, password } = validation.data;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Compare password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Generate token
  const token = generateToken(user.id);

  // Set cookie
  res.cookie("token", token, {
    ...cookieOptions,
    maxAge: SEVEN_DAYS,
  });

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Login successful",
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    },
  });
});

// POST /api/v1/auth/logout
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie("token", cookieOptions);

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Logged out successfully",
    data: null,
  });
});