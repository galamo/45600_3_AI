import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

/**
 * @param {string} [uploadsDir]
 */
export async function ensureUploadsDir(uploadsDir = UPLOADS_DIR) {
  await fs.mkdir(uploadsDir, { recursive: true });
}

/**
 * Map MIME type to a safe file extension.
 * @param {string} mimetype
 * @returns {".png" | ".jpg"}
 */
export function extensionForMimetype(mimetype) {
  if (mimetype === "image/png") return ".png";
  return ".jpg";
}

/**
 * Build a unique filename for disk storage.
 * @param {string} mimetype
 * @returns {string}
 */
export function uniqueUploadFilename(mimetype) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extensionForMimetype(mimetype)}`;
}
