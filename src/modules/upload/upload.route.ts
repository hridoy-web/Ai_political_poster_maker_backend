import { Router } from "express";
import { upload } from "../../middlewares/multer.middleware.js";
import { uploadController } from "./upload.controller.js";

const router = Router();

router.post("/", upload.single("image"), uploadController);

export default router;