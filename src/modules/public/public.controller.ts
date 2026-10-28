import type { Request, Response } from "express";
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
