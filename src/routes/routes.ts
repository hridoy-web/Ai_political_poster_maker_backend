import { Router } from "express";
import uploadRouter from "../modules/upload/upload.route.js";

const router = Router();
router.use("/upload", uploadRouter);

export default router;
