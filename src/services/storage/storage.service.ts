import cloudinary, { uploadOnCloudinary } from "../../config/cloudinary.js";


export class StorageService {
  async uploadBuffer(buffer: Buffer, folderName: string = 'political_posters_2') {
    return await uploadOnCloudinary(buffer, folderName);
  }

  async deleteFile(publicId: string) {
    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Error deleting file from Cloudinary:', error);
      throw error;
    }
  }
}