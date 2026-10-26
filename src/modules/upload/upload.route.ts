import { Router } from "express";
<<<<<<< HEAD
import { uploadController, deleteAssetController, verifyAssetOwner } from "./upload.controller.js";
import { upload as multerUpload } from "../../middlewares/multer.middleware.js";

const router = Router();

router.post("/", multerUpload.single("image"), uploadController);
router.delete("/:id", verifyAssetOwner, deleteAssetController);
=======
import { uploadController } from "./upload.controller.js";
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
>>>>>>> d329304 (feat: secure auth and guest ownership flows)

export default router;