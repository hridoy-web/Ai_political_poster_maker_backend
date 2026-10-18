import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import sendResponse from "../../utils/sendResponse.js";
import { prisma } from "../../config/db.js";

export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "User fetched successfully",
      data: user,
    });
  },
);