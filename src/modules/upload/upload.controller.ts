import type { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { StorageService } from "../../services/storage/storage.service.js";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

const storageService = new StorageService();

export const uploadController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  let uploadResult: any = null;

  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "Image file is required." });
      return;
    }

    // ১. সিকিউরড req.user থেকে ওনার আইডি নেওয়া, না থাকলে বডি বা গেস্ট চেক করা
    const ownerUserId = (req as any).user?.id || req.body.ownerUserId || null;
    const guestSessionId = req.body.guestSessionId || null;
    const purpose = req.body.purpose;

    if (!purpose) {
      res.status(400).json({ success: false, message: "Asset purpose is required." });
      return;
    }

    if (!ownerUserId && !guestSessionId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Valid authenticated user or guest session is required.",
      });
      return;
    }

    // ২. Magic Bytes ভ্যালিডেশন
    const detectedType = await fileTypeFromBuffer(req.file.buffer);
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    if (!detectedType || !allowedMimeTypes.includes(detectedType.mime)) {
      res.status(400).json({
        success: false,
        message: "Invalid file format. Only true JPEG, PNG, or WebP images are allowed.",
      });
      return;
    }

    // ৩. Sharp অপ্টিমাইজেশন ও Checksum জেনারেশন
    const checksum = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const sharpInstance = sharp(req.file.buffer)
      .resize({ width: 1920, height: 1080, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 });

    const processedBuffer = await sharpInstance.toBuffer();
    const metadata = await sharp(processedBuffer).metadata();

    // ৪. ক্লাউডিনারি আপলোড
    uploadResult = await storageService.uploadBuffer(processedBuffer, "political_posters_2");

    // ৫. ডাটাবেজে সেভ
    const newAsset = await prisma.asset.create({
      data: {
        storageKey: uploadResult.public_id,
        mimeType: "image/webp",
        sizeBytes: processedBuffer.length,
        width: metadata.width || null,
        height: metadata.height || null,
        checksum: checksum,
        purpose: purpose,
        ownerUserId: ownerUserId,
        guestSessionId: guestSessionId,
      },
    });

    res.status(201).json({
      success: true,
      message: "Image processed, uploaded securely, and asset recorded successfully.",
      data: {
        id: newAsset.id,
        storageKey: newAsset.storageKey,
        mimeType: newAsset.mimeType,
        sizeBytes: newAsset.sizeBytes,
        width: newAsset.width,
        height: newAsset.height,
        checksum: newAsset.checksum,
        createdAt: newAsset.createdAt,
      },
    });

  } catch (error: any) {
    console.error("UPLOAD CONTROLLER ERROR:", error);

    // Rollback
    if (uploadResult && uploadResult.public_id) {
      await storageService.deleteFile(uploadResult.public_id).catch(() => { });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      res.status(400).json({
        success: false,
        message: "Foreign key constraint failed. User session or ownerUserId does not exist in database.",
      });
      return;
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      res.status(422).json({
        success: false,
        message: "Validation error: Check your input data or enum values.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      errorDetails: error?.message || error,
    });
  }
};