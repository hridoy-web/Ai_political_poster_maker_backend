import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { bookmarkController } from "./bookmark.controller.js";

const bookmarkRoutes = Router();

bookmarkRoutes.use(verifyToken);

// Create Bookmark (Body-{ templateId } pass)
bookmarkRoutes.post("/", bookmarkController.addBookmark);

// List Bookmarks
bookmarkRoutes.get("/", bookmarkController.getMyBookmarks);

// Delete Bookmark
bookmarkRoutes.delete("/:templateId", bookmarkController.removeBookmark);

export default bookmarkRoutes;