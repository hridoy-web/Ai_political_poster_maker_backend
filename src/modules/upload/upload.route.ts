import { Router } from "express";
import { uploadController, deleteAssetController, verifyAssetOwner } from "./upload.controller.js";
import { upload as multerUpload } from "../../middlewares/multer.middleware.js";

const router = Router();

router.post("/", multerUpload.single("image"), uploadController);
router.delete("/:id", verifyAssetOwner, deleteAssetController);

export default router;