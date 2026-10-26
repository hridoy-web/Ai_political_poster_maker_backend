import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { bookmarkController } from "./bookmark.controller.js";

const bookmarkRoutes = Router();

bookmarkRoutes.use(verifyToken);

bookmarkRoutes.post("/", bookmarkController.addBookmark);
bookmarkRoutes.get("/", bookmarkController.getMyBookmarks);
bookmarkRoutes.delete("/:templateId", bookmarkController.removeBookmark);

export default bookmarkRoutes;