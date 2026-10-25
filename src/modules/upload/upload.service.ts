import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import crypto from "crypto";

export const uploadImageService = async (
    file: Express.Multer.File | undefined,
    body: { purpose: string; ownerUserId?: string; guestSessionId?: string }
) => {
    if (!file) {
        throw new ApiError(400, "Image file is required.");
    }

    // 1. Magic Bytes Validation
    const detectedType = await fileTypeFromBuffer(file.buffer);
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!detectedType || !allowedMimeTypes.includes(detectedType.mime)) {
        throw new ApiError(400, "Invalid file format. Only true JPEG, PNG, or WebP images are allowed.");
    }

    // 2. Generate SHA-256 Checksum
    const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // 3. Process with Sharp
    const processedBuffer = await sharp(file.buffer)
        .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

    const metadata = await sharp(processedBuffer).metadata();

    // 4. Generate a unique storage key (Cloudinary public ID format)
    const uniqueSuffix = crypto.randomBytes(16).toString("hex");
    const storageKey = `political_posters_2/${uniqueSuffix}`;

    // 5. Database Persistence
    try {
        const asset = await prisma.asset.create({
            data: {
                storageKey, // Updated to use the unique dynamic key
                mimeType: "image/webp",
                sizeBytes: processedBuffer.length,
                width: metadata.width || 0,
                height: metadata.height || 0,
                checksum,
                purpose: body.purpose as any,
                ownerUserId: body.ownerUserId || null,
                guestSessionId: body.guestSessionId || null,
            },
        });

        return asset;
    } catch (dbError: any) {
        throw new ApiError(500, "Database persistence failed. Upload rolled back securely.", [], dbError.stack);
    }
};