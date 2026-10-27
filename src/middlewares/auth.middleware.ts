import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { prisma } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

interface TokenPayload extends JwtPayload {
  id: string;
}

// Optional user authentication for routes available to either users or guests.
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

    if (!token) {
      next();
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      next();
      return;
    }

    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });

    if (typeof decoded !== "string" && typeof decoded.id === "string") {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true, status: true },
      });

      if (user?.status === "ACTIVE") {
        req.user = { id: user.id, name: user.name, email: user.email };
        (req as any).user.role = (decoded as TokenPayload & { role?: string }).role;
      }
    }

    next();
  } catch {
    // Invalid or expired user tokens continue only if guest verification succeeds next.
    next();
  }
};

export const verifyToken = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    // UPDATE: আগে getToken() cookie থেকে token ফেরাত,
    // কিন্তু token-এর type ও empty value আলাদা করে যাচাই করত না।
    const token: unknown = req.cookies?.token;

    if (typeof token !== "string" || token.length === 0) {
      // UPDATE: আগে এখানে সরাসরি res.status(401).json(...) ছিল।
      // এখন ApiError ব্যবহার করছি, যাতে error.middleware response সামলায়।
      throw new ApiError(401, "Please log in to continue");
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      // আগেও secret check ছিল। এখন configuration error-টা
      // ApiError দিয়ে global error middleware-এ পাঠানো হচ্ছে।
      throw new ApiError(500, "Authentication is temporarily unavailable");
    }

    let decoded: TokenPayload;

    try {
      // UPDATE: আগে token verify করে payload-কে সরাসরি TokenPayload ধরা হতো।
      // এখন শুধু HS256 algorithm গ্রহণ করি।
      const verified = jwt.verify(token, secret, {
        algorithms: ["HS256"],
      });

      // UPDATE: আগে payload-এ id আছে কি না/type string কি না দেখা হতো না।
      if (
        typeof verified === "string" ||
        typeof verified.id !== "string" ||
        verified.id.length === 0
      ) {
        throw new ApiError(401, "Invalid login token");
      }

      decoded = verified as TokenPayload;
    } catch (error) {
      // ApiError হলে সেটি সরাসরি error middleware-এ যাবে।
      if (error instanceof ApiError) {
        throw error;
      }

      // আগে TokenExpiredError ও JsonWebTokenError ধরে response পাঠানো হতো।
      // এখন একই error-গুলো ApiError দিয়ে পাঠাই।
      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, "Login has expired; please log in again");
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, "Invalid login token");
      }

      // Database বা অপ্রত্যাশিত অন্য error হলে সেটিও global handler-এ যাবে।
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,

        // UPDATE: আগে query-তে status আনা হতো না।
        status: true,
      },
    });

    // UPDATE: আগে শুধু user পাওয়া গেছে কি না দেখা হতো।
    // এখন blocked/deleted user-ও protected route থেকে আটকাবে।
    if (!user || user.status !== "ACTIVE") {
      throw new ApiError(401, "This account cannot access the service");
    }

    // আগের মতোই verified user-কে request context-এ রাখি।
    // Password বা status req.user-এ দেওয়া হচ্ছে না।
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    next();
  },
);