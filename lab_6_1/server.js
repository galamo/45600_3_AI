import "dotenv/config";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  ImageUploadValidationError,
  validateUploadedImage,
} from "./src/schemas/imageUploadSchema.js";
import { analyzeImage } from "./src/agents/imageVisionAgent.js";
import {
  UPLOADS_DIR,
  ensureUploadsDir,
  uniqueUploadFilename,
} from "./src/lib/saveUploadedImage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

await ensureUploadsDir(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, uniqueUploadFilename(file.mimetype));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5_242_880 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") {
      cb(null, true);
      return;
    }
    cb(new Error("Only PNG and JPEG images are allowed"));
  },
});

/**
 * Coerce multipart form values to a real boolean. Default false.
 * Accepts true/false booleans and string forms: "true"/"false"/"on"/"off"/"1"/"0".
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function parseIsAiAuthenticity(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "on" || normalized === "1") {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "off" ||
      normalized === "0" ||
      normalized === ""
    ) {
      return false;
    }
  }
  return false;
}

const app = express();

app.use(cors());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/upload-image", (req, res) => {
  upload.single("image")(req, res, async (multerErr) => {
    if (multerErr) {
      const isSize =
        multerErr instanceof multer.MulterError &&
        multerErr.code === "LIMIT_FILE_SIZE";
      res.status(400).json({
        error: isSize
          ? "Image must be 5MB or smaller"
          : multerErr.message || "Upload failed",
        details: isSize
          ? [{ path: "image", message: "File exceeds 5MB limit" }]
          : [],
      });
      return;
    }

    try {
      validateUploadedImage(req.file);

      const filename = req.file.filename;
      const absolutePath = path.join(UPLOADS_DIR, filename);
      const imageUrl = `/uploads/${filename}`;
      const isAiAuthenticity = parseIsAiAuthenticity(req.body?.isAiAuthenticity);

      if (typeof isAiAuthenticity !== "boolean") {
        res.status(400).json({
          error: "isAiAuthenticity must be a boolean",
          details: [
            {
              path: "isAiAuthenticity",
              message: "Expected boolean after form coercion",
            },
          ],
        });
        return;
      }

      const result = await analyzeImage(absolutePath, { isAiAuthenticity });

      /** @type {Record<string, unknown>} */
      const payload = {
        success: true,
        imageUrl,
        tags: result.tags,
        description: result.description,
      };
      if (result.aiAuthenticity) {
        payload.aiAuthenticity = result.aiAuthenticity;
      }

      res.json(payload);
    } catch (err) {
      if (err instanceof ImageUploadValidationError) {
        res.status(400).json({ error: err.message, details: err.details });
        return;
      }

      const message = err?.message || String(err);
      console.error("Vision upload failed:", message);
      res.status(500).json({ error: message });
    }
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

export { app };

const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]));

if (isMainModule) {
  app.listen(port, () => {
    console.log(`Vision agent listening on http://localhost:${port}`);
    console.log(`GET  /api/health`);
    console.log(`POST /upload-image — multipart field "image"`);
    console.log(`GET  / — dark UI (index.html)`);
  });
}
