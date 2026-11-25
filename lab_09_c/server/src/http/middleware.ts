/**
 * Cross-cutting HTTP middleware: request ids, safe error responses, 404s.
 */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger, errorFields } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get("x-request-id");
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.set("X-Request-Id", id);
  next();
}

/** Never leak stack traces, SQL, or provider errors to the client — log them with the request id. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId as string | undefined;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, requestId });
    return;
  }
  if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large.", requestId });
    return;
  }
  logger.error("unhandled error", { requestId, ...errorFields(err) });
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal error. Please try again.", requestId });
}
