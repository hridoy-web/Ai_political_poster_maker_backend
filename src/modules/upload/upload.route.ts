import { Router } from "express";
import { uploadController, deleteAssetController, verifyAssetOwner } from "./upload.controller.js";
import { upload as multerUpload } from "../../middlewares/multer.middleware.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { requireUserOrGuest } from "../../middlewares/guest.middleware.js";

const router = Router();

router.post(
  "/",
  optionalAuth,
  requireUserOrGuest,
  multerUpload.single("image"),
  uploadController,
);

router.delete(
  "/:id",
  optionalAuth,
  requireUserOrGuest,
  verifyAssetOwner,
  deleteAssetController,
);

export default router;