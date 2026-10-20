
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";

// ১. বুকমার্ক যোগ করা
const addBookmark = async (userId: string, templateId: string) => {
  // টেমপ্লেটটি আদৌ আছে কিনা যাচাই
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new ApiError(404, "Template not found");
  }

  // আগেই বুকমার্ক করা আছে কিনা চেক করা
  const existingBookmark = await prisma.bookmark.findUnique({
    where: {
      userId_templateId: {
        userId,
        templateId,
      },
    },
  });

  if (existingBookmark) {
    throw new ApiError(409, "Template is already bookmarked");
  }

  return await prisma.bookmark.create({
    data: {
      userId,
      templateId,
    },
    include: {
      template: {
        select: {
          id: true,
          title: true,
          aspectRatio: true,
          width: true,
          height: true,
          previewAssetId: true,
        },
      },
    },
  });
};

// ২. বুকমার্ক রিমুভ করা
const removeBookmark = async (userId: string, templateId: string) => {
  try {
    return await prisma.bookmark.delete({
      where: {
        userId_templateId: {
          userId,
          templateId,
        },
      },
    });
  } catch (err: any) {
    if (err.code === "P2025") {
      throw new ApiError(404, "Bookmark not found");
    }
    throw err;
  }
};

// ৩. লগইন করা ইউজারের বুকমার্ক করা টেমপ্লেট লিস্ট পাওয়া
const getUserBookmarks = async (userId: string) => {
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      template: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  return bookmarks.map((b) => b.template);
};

export const bookmarkService = {
  addBookmark,
  removeBookmark,
  getUserBookmarks,
};