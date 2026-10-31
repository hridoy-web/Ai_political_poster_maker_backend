import type { Request, Response } from "express";
import crypto from "crypto";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { prisma } from "../../config/db.js";

export const getPublicStats = asyncHandler(
  async (req: Request, res: Response) => {
    const [userCount, posterCount, templateCount, categoryCount] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.poster.count(),
      prisma.template.count({ where: { status: "PUBLISHED" } }),
      prisma.templateCategory.count({ where: { isActive: true } }),
    ]);

    return sendResponse(
      res,
      200,
      "Public platform statistics retrieved successfully",
      true,
      null,
      {
        totalUsers: userCount,
        totalPosters: posterCount,
        totalTemplates: templateCount,
        totalCategories: categoryCount,
        rating: 4.9,
      }
    );
  }
);

/**
 * Privacy-friendly visitor tracking with 1-hour deduplication
 * Anonymizes client IP using a one-way SHA-256 hash.
 */
export const trackVisit = asyncHandler(
  async (req: Request, res: Response) => {
    let rawIp = (req.ip || req.socket.remoteAddress || "127.0.0.1").toString();
    if (rawIp.startsWith("::ffff:")) {
      rawIp = rawIp.replace("::ffff:", "");
    }
    const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");

    const rawPath = typeof req.body?.path === "string" ? req.body.path.trim().slice(0, 255) : "/";
    const rawUserAgent = typeof req.headers["user-agent"] === "string"
      ? req.headers["user-agent"].slice(0, 500)
      : typeof req.body?.userAgent === "string"
        ? req.body.userAgent.slice(0, 500)
        : null;

    const rawReferrer = typeof req.headers["referer"] === "string"
      ? req.headers["referer"].slice(0, 500)
      : typeof req.headers["referrer"] === "string"
        ? req.headers["referrer"].slice(0, 500)
        : typeof req.body?.referrer === "string"
          ? req.body.referrer.slice(0, 500)
          : null;

    // Deduplication: check if same ipHash visited within the last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentVisit = await prisma.visitorLog.findFirst({
      where: {
        ipHash,
        createdAt: { gte: oneHourAgo },
      },
      select: { id: true },
    });

    if (recentVisit) {
      return sendResponse(
        res,
        200,
        "Visit already recorded recently",
        true,
        null,
        {
          tracked: false,
          deduplicated: true,
        }
      );
    }

    const log = await prisma.visitorLog.create({
      data: {
        ipHash,
        path: rawPath || "/",
        userAgent: rawUserAgent,
        referrer: rawReferrer,
      },
      select: {
        id: true,
        path: true,
        createdAt: true,
      },
    });

    return sendResponse(
      res,
      201,
      "Visit recorded successfully",
      true,
      null,
      {
        tracked: true,
        id: log.id,
      }
    );
  }
);
