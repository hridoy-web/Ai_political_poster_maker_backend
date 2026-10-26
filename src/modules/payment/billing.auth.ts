import { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";

interface TokenPayload extends JwtPayload {
  id: string;
  role?: string;
}

/**
 * Self-contained auth middleware for Billing, Payment, Wallet and Subscription.
 * Supports token extraction from both cookies (web app) and Authorization: Bearer header (Postman/API).
 * Keeps Shakil's auth.middleware.ts 100% untouched.
 */
export const requireBillingAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null);

    if (!token) {
      throw new ApiError(401, "Authentication required. Please login or provide a valid session token.");
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new ApiError(500, "Server configuration error: JWT_SECRET missing.");
    }

    const decoded = jwt.verify(token, secret) as TokenPayload;
    if (!decoded?.id) {
      throw new ApiError(401, "Invalid token payload.");
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new ApiError(401, "User not found or account is inactive.");
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error instanceof ApiError) {
      return next(error);
    }
    if (error.name === "TokenExpiredError") {
      return next(new ApiError(401, "Token expired. Please login again."));
    }
    if (error.name === "JsonWebTokenError") {
      return next(new ApiError(401, "Invalid token."));
    }
    return next(new ApiError(500, "Internal authentication error."));
  }
};
