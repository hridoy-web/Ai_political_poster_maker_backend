import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../config/db.js";

interface TokenPayload extends JwtPayload {
  id: string;
}

const getToken = (req: Request): string | null => {
  if (req.cookies?.token) return req.cookies.token;
  return null;
};

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = getToken(req);

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: token missing" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }

    const decoded = jwt.verify(token, secret) as TokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: user not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res
        .status(401)
        .json({ success: false, message: "Token expired, please login again" });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    console.error("Auth middleware error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
