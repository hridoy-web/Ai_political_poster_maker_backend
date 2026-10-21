import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";


const addBookmark = async (userId: string, templateId: string) => {
  
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new ApiError(404, "Template not found");
  }

 
  if (template.status !== "PUBLISHED") {
    throw new ApiError(400, "Only published templates can be bookmarked");
  }

  
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

// Bookmark Remove
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

// ৩. Get the list of templates bookmarked by the logged-in user.
const getUserBookmarks = async (userId: string) => {
  const bookmarks = await prisma.bookmark.findMany({
    where: { 
      userId,
      template: {
        status: "PUBLISHED", 
      },
    },
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