import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import crypto from "crypto";
import { storageService } from "../../services/storage/storage.service.js";

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

    let uploadedPublicId: string | null = null;

    try {
        // 4. Cloudinary Upload
        const uploadResult = await storageService.uploadBuffer(processedBuffer, "political_posters_2");
        uploadedPublicId = uploadResult.public_id;

        // 5. Database Persistence
        const asset = await prisma.asset.create({
            data: {
                storageKey: uploadedPublicId,
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
        if (uploadedPublicId) {
            await storageService.deleteFile(uploadedPublicId);
        }
        throw new ApiError(500, "Database persistence failed. Upload rolled back securely.", [], dbError.stack);
    }
};

export const validateAssetAccess = async (
    assetId: string,
    userId?: string,
    guestSessionId?: string
) => {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new ApiError(404, "Asset not found");
    if (asset.deletedAt) throw new ApiError(400, "Asset has been deleted");

    if (asset.ownerUserId && userId && asset.ownerUserId !== userId) {
        throw new ApiError(403, "Forbidden: You do not own this private asset");
    }
    if (asset.guestSessionId && guestSessionId && asset.guestSessionId !== guestSessionId) {
        throw new ApiError(403, "Forbidden: You do not own this guest asset");
    }
    return asset;
};

export const deleteAssetService = async (
    assetId: string,
    userId?: string,
    guestSessionId?: string
) => {
    const asset = await validateAssetAccess(assetId, userId, guestSessionId);

    // Delete from Cloudinary storage
    if (asset.storageKey) {
        await storageService.deleteFile(asset.storageKey);
    }

    // Soft-delete in database
    const updatedAsset = await prisma.asset.update({
        where: { id: assetId },
        data: { deletedAt: new Date() },
    });

    return updatedAsset;
};