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
        { folder },
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

  // Added to support poster.service.ts calls
  getSecureUrl(publicId: string | null | undefined): string {
    if (!publicId) return "";
    // If it's already a full URL, return it directly
    if (publicId.startsWith("http://") || publicId.startsWith("https://")) {
      return publicId;
    }
    // Otherwise, generate Cloudinary secure URL from the public ID / storageKey
    return cloudinary.url(publicId, { secure: true });
  },
};