import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { bookmarkController } from "./bookmark.controller.js";
import router from "../upload/upload.route.js";

const bookmarkRoutes = Router;

router.use(verifyToken);

router.post("/", bookmarkController.addBookmark);
router.get("/", bookmarkController.getMyBookmarks)
router.delete("/:templateId", bookmarkController.removeBookmark)

export default bookmarkRoutes