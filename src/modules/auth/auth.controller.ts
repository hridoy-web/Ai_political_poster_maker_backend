import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../../config/db.js";
import { registerSchema, loginSchema } from "./auth.validation.js";
import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

// Generate JWT
const generateToken = (userId: string | number) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
  });
};

// POST /api/v1/auth/register
export const register = async (req: Request, res: Response) => {
  let uploadedPublicId: string | null = null;

  try {
    // Validate request body
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0]?.message || "Invalid input",
      });
    }

    const { name, email, password } = validation.data;

    // Check existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
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
    // 1. Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // 2. Create Asset record
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

      // 3. Connect Asset to User
      await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarAssetId: assetId,
        },
      });
    }
    // Return response
    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        ...user,
        image: imageUrl,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    // Clean up uploaded image if registration fails
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
// POST /api/v1/auth/login
export const login = async (req: Request, res: Response) => {
  try {
    // Zod validation
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0]?.message || "Invalid input",
      });
    }

    const { email, password } = validation.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // Set cookie
    res.cookie("token", token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
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
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// POST /api/v1/auth/logout
export const logout = async (_req: Request, res: Response) => {
  try {
    res.clearCookie("token", cookieOptions);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
      data: null,
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
