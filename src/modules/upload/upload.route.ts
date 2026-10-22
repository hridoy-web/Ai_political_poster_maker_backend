import { Router } from "express";
import { uploadController } from "./upload.controller.js";
import multer from "multer";

const router = Router();

// Multer কনফিগারেশন (মেমরি স্টোরেজ ও ফাইল সাইজ লিমিট)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // সর্বোচ্চ ৫ এমবি
    },
});

// রাউটে upload.single("image") মিডলওয়্যারটি যুক্ত করা হলো
router.post("/", upload.single("image"), uploadController);

export default router;