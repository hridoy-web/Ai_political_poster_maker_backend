import { Router } from "express";
import { uploadController } from "./upload.controller.js";
import { upload as multerUpload } from "../../middlewares/multer.middleware.js"; const router = Router();

router.post("/", multerUpload.single("image"), uploadController);

export default router;