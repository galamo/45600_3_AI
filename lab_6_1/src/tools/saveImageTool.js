import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  UPLOADS_DIR,
  ensureUploadsDir,
  uniqueUploadFilename,
} from "../lib/saveUploadedImage.js";

export const SAVED_IMAGES_DIR = path.join(UPLOADS_DIR, "saved");

/**
 * Build a tool that copies the current upload into uploads/saved/.
 * Bound to one source file path per agent run.
 *
 * @param {string} sourceFilePath - Absolute path of the uploaded image
 */
export function createSaveImageTool(sourceFilePath) {
  return tool(
    async ({ label }) => {
      try {
        await ensureUploadsDir(SAVED_IMAGES_DIR);

        const ext = path.extname(sourceFilePath).toLowerCase() || ".jpg";
        const mimetype = ext === ".png" ? "image/png" : "image/jpeg";
        const baseName = uniqueUploadFilename(mimetype).replace(
          /\.(png|jpg)$/i,
          "",
        );
        const safeLabel = label
          ?.trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40);
        const filename = `${safeLabel ? `${safeLabel}-` : ""}${baseName}${ext}`;
        const destPath = path.join(SAVED_IMAGES_DIR, filename);

        await fs.copyFile(sourceFilePath, destPath);

        return JSON.stringify({
          success: true,
          savedPath: destPath,
          filename,
          relativeUrl: `/uploads/saved/${filename}`,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err?.message || String(err),
        });
      }
    },
    {
      name: "save_image",
      description:
        "Persist a copy of the analyzed image under uploads/saved/. " +
        "Call this once after you understand the image if you want to archive it. " +
        "Optional label becomes part of the filename.",
      schema: z.object({
        label: z
          .string()
          .optional()
          .describe(
            "Optional short label for the filename (e.g. beach-sunset, cat).",
          ),
      }),
    },
  );
}
