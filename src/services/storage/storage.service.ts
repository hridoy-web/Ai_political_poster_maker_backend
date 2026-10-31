import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const storageService = {
  async uploadBuffer(buffer: Buffer, folder: string): Promise<{ public_id: string; secure_url: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, type: "authenticated" }, // Upload as authenticated/private asset by default
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("Cloudinary upload failed: no result returned"));
          resolve({ public_id: result.public_id, secure_url: result.secure_url });
        }
      );
      uploadStream.end(buffer);
    });
  },

  async deleteFile(publicId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result !== "ok" && result.result !== "not found") {
        throw new Error(`Cloudinary deletion failed with status: ${result.result}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to delete file from Cloudinary: ${err.message}`);
    }
  },

  getSecureUrl(publicId: string | null | undefined): string {
    if (!publicId) return "";
    if (publicId.startsWith("http://") || publicId.startsWith("https://")) {
      return publicId;
    }
    return cloudinary.url(publicId, { secure: true });
  },

  /**
   * Generates a limited-time signed URL for private/authenticated assets
   * @param publicId Cloudinary public ID or storageKey
   * @param expiresInSeconds Expiration time in seconds (default: 3600 seconds / 1 hour)
   */
  getSignedUrl(publicId: string, expiresInSeconds: number = 3600): string {
    if (!publicId) return "";

    const timestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;

    // Generate authenticated signed URL from Cloudinary SDK
    return cloudinary.utils.private_download_url(publicId, "webp", {
      resource_type: "image",
      type: "authenticated",
      expires_at: timestamp,
    });
  },
};