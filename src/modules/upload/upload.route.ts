import { Router } from "express";
import {
  uploadController,
  deleteAssetController,
} from "./upload.controller.js";
import { upload as multerUpload } from "../../middlewares/multer.middleware.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { requireUserOrGuest } from "../../middlewares/guest.middleware.js";

const router = Router();

// Upload ও delete—দুই ক্ষেত্রেই আগে server-side identity যাচাই করি।
router.use(optionalAuth);
router.use(requireUserOrGuest);

router.post("/", multerUpload.single("image"), uploadController);
router.delete("/:id", deleteAssetController);

export default router;