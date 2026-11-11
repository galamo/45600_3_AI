import { z } from "zod";

const ALLOWED_MIMETYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 1_048_576;

export const imageUploadSchema = z.object({
  mimetype: z.enum(ALLOWED_MIMETYPES, {
    error: "Only PNG and JPEG images are allowed",
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_BYTES, { error: "Image must be 1MB or smaller" }),
  originalname: z.string().min(1, { error: "originalname is required" }),
  filename: z.string().min(1, { error: "filename is required" }),
});

export class ImageUploadValidationError extends Error {
  /**
   * @param {string} message
   * @param {unknown[]} [details]
   */
  constructor(message, details = []) {
    super(message);
    this.name = "ImageUploadValidationError";
    this.details = details;
  }
}

/**
 * Validate multer's req.file metadata (not raw binary).
 * @param {Express.Multer.File | undefined} file
 */
export function validateUploadedImage(file) {
  if (!file) {
    throw new ImageUploadValidationError("No image file uploaded", [
      { path: "image", message: "Field 'image' is required" },
    ]);
  }

  const result = imageUploadSchema.safeParse({
    mimetype: file.mimetype,
    size: file.size,
    originalname: file.originalname,
    filename: file.filename,
  });

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "image",
      message: issue.message,
    }));
    throw new ImageUploadValidationError("Invalid image upload", details);
  }

  return result.data;
}

export { ALLOWED_MIMETYPES, MAX_BYTES };
