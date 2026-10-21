import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'bizflow_uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  } as any,
});

/** Explicit multer limits for every upload route (avatars, logos, product photos). */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_LIMITS = { fileSize: UPLOAD_MAX_BYTES, files: 1 } as const;
