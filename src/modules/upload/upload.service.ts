import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import crypto from "crypto";
import { storageService } from "../../services/storage/storage.service.js";

const ALLOWED_PURPOSES = [
    "USER_UPLOAD",
    "GENERATED_BACKGROUND",
    "POSTER_OUTPUT",
    "TEMPLATE_PREVIEW",
    "TEMPLATE_ASSET",
    "LOGO",
] as const;

export const uploadImageService = async (
    file: Express.Multer.File | undefined,
    body: { purpose: string; ownerUserId?: string; guestSessionId?: string }
) => {
    if (!file) {
        throw new ApiError(400, "Image file is required.");
    }

    const purpose = body.purpose || "USER_UPLOAD";
    if (!ALLOWED_PURPOSES.includes(purpose as any)) {
        throw new ApiError(400, `Invalid purpose. Allowed values are: ${ALLOWED_PURPOSES.join(", ")}`);
    }

    const detectedType = await fileTypeFromBuffer(file.buffer);
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!detectedType || !allowedMimeTypes.includes(detectedType.mime)) {
        throw new ApiError(400, "Invalid file format. Only true JPEG, PNG, or WebP images are allowed.");
    }

    const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");

    let processedBuffer: Buffer;
    let metadata: any;

    try {
        const image = sharp(file.buffer);
        metadata = await image.metadata();

        if ((metadata.width && metadata.width > 4000) || (metadata.height && metadata.height > 4000)) {
            throw new ApiError(400, "Image dimensions exceed the maximum allowed limit of 4000x4000 pixels.");
        }

        processedBuffer = await image
            .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();

        metadata = await sharp(processedBuffer).metadata();
    } catch (sharpError: any) {
        if (sharpError instanceof ApiError) throw sharpError;
        throw new ApiError(400, "Corrupt or unsupported image file.");
    }

    let uploadedPublicId: string | null = null;

    try {
        const uploadResult = await storageService.uploadBuffer(processedBuffer, "political_posters_2");
        uploadedPublicId = uploadResult.public_id;

        const asset = await prisma.asset.create({
            data: {
                storageKey: uploadedPublicId,
                mimeType: "image/webp",
                sizeBytes: processedBuffer.length,
                width: metadata.width || 0,
                height: metadata.height || 0,
                checksum,
                purpose: purpose as any,
                ownerUserId: body.ownerUserId || null,
                guestSessionId: body.guestSessionId || null,
            },
        });

        return asset;
    } catch (dbError: any) {
        if (uploadedPublicId) {
            try {
                await storageService.deleteFile(uploadedPublicId);
            } catch (cleanupError) {
                console.error("Critical: Orphaned Cloudinary asset cleanup failed during rollback.");
            }
        }
        // Removed internal stack/path exposure for production security
        throw new ApiError(500, "Database persistence failed. Upload rolled back securely.");
    }
};

export const validateAssetAccess = async (
    assetId: string,
    userId?: string,
    guestSessionId?: string,
    generateSignedUrl: boolean = false
) => {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new ApiError(404, "Asset not found");
    if (asset.deletedAt) throw new ApiError(400, "Asset has been deleted");

    // পরিচয় না থাকলে বা asset-এর মালিকের সঙ্গে না মিললে access বন্ধ করি।
    const isUserOwner = Boolean(asset.ownerUserId && asset.ownerUserId === userId);
    const isGuestOwner = Boolean(
        asset.guestSessionId && asset.guestSessionId === guestSessionId
    );
    if (!isUserOwner && !isGuestOwner) {
        throw new ApiError(403, "Forbidden: You do not own this asset");
    }

    // If requested, attach a limited-time signed URL for secure private viewing
    let signedUrl = null;
    if (generateSignedUrl && asset.storageKey) {
        signedUrl = storageService.getSignedUrl(asset.storageKey, 3600); // Valid for 1 hour
    }

    return {
        ...asset,
        signedUrl,
    };
};

export const deleteAssetService = async (
    assetId: string,
    userId?: string,
    guestSessionId?: string
) => {
    const asset = await validateAssetAccess(assetId, userId, guestSessionId, false);

    if (asset.storageKey) {
        await storageService.deleteFile(asset.storageKey);
    }

    const updatedAsset = await prisma.asset.update({
        where: { id: assetId },
        data: { deletedAt: new Date() },
    });

    return updatedAsset;
};