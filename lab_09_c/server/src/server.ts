/**
 * HTTP entry point. Exports `app` (for tests); listens only when run directly.
 *
 * Security middleware:
 *   helmet        — secure headers + a strict Content-Security-Policy for the built UI
 *   cors          — explicit origin allow-list (CORS_ORIGINS)
 *   json limit    — 64kb bodies
 *   rate limit    — on the LLM endpoints (see http/routes.ts)
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getEnv } from "./config/env.js";
import { closePools } from "./db/pools.js";
import { errorHandler, requestId } from "./http/middleware.js";
import { apiRouter } from "./http/routes.js";
import { logger, setLogLevel } from "./lib/logger.js";
import { closeMermaidMcp } from "./services/mermaid-mcp.service.js";

const env = getEnv(); // fail fast on bad config
setLogLevel(env.LOG_LEVEL);

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(requestId);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Mermaid renders SVG with inline styles; Google Fonts for the UI typeface.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(cors({ origin: env.CORS_ORIGINS }));
app.use(express.json({ limit: "64kb" }));

app.use("/api", apiRouter());

// Built client (npm run build in client/ copies it to server/public).
// index.html must never be cached (it points at the current hashed bundles); hashed assets can be cached forever.
app.use(
  express.static(publicDir, {
    index: "index.html",
    setHeaders: (res, filePath) => {
      res.setHeader(
        "Cache-Control",
        filePath.endsWith("index.html") ? "no-cache" : filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "public, max-age=3600"
      );
    },
  })
);
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(publicDir, "index.html"), (err) => err && next());
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const server = app.listen(env.PORT, () => {
    logger.info(`Lab 09 c agents server on http://localhost:${env.PORT}`, {
      models: { default: env.TESTING_MODEL, sql: env.SQL_BASED_MODEL },
    });
  });
  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    server.close(async () => {
      await Promise.allSettled([closePools(), closeMermaidMcp()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
