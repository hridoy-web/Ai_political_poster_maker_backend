import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";
import { bookmarkService } from "./bookmark.service.js";

// ১. বুকমার্ক যুক্ত করা
const addBookmark = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { templateId } = req.body;

  if (!userId) {
    throw new ApiError(401, "Unauthorized user");
  }

  if (!templateId) {
    throw new ApiError(400, "templateId is required");
  }

  const result = await bookmarkService.addBookmark(userId, templateId);

  sendResponse(
    res, 
    201,
    "Template bookmarked successfully",
    true,
    null, 
    result);
});

// ২. বুকমার্ক রিমুভ করা
const removeBookmark = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { templateId } = req.params;

  if (!userId) {
    throw new ApiError(401, "Unauthorized user");
  }

  const result = await bookmarkService.removeBookmark(userId, templateId as string);

  sendResponse(
    res,
    200,
    "Bookmark removed successfully",
    true,
    null,
    result);
});

// ৩. ইউজারের সব বুকমার্ক পাওয়া
const getMyBookmarks = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized user");
  }

  const result = await bookmarkService.getUserBookmarks(userId);

  sendResponse(
    res,
     200, 
     "Bookmarks fetched successfully",
      true,
       null, 
       result);
});

export const bookmarkController = {
  addBookmark,
  removeBookmark,
  getMyBookmarks,
};