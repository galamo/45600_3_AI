/**
 * Chat endpoints.
 *   POST /api/chat         → JSON (simple clients, curl, tests)
 *   POST /api/chat/stream  → Server-Sent Events: live `trace` events, then one `result`
 *
 * Both run the same graph inside a request context that carries the trace, artifacts and an
 * AbortSignal (client disconnect or REQUEST_TIMEOUT_MS cancels the in-flight LLM calls).
 */
import type { Request, Response } from "express";
import { getEnv } from "../config/env.js";
import { runChat } from "../graph/chat.graph.js";
import { logger } from "../lib/logger.js";
import { createContext, runWithContext, type RequestContext } from "../lib/request-context.js";
import type { TraceEvent } from "../types.js";
import { ChatRequestSchema, type ChatResponse } from "./schemas.js";
import { HttpError } from "./middleware.js";

function parseBody(req: Request) {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid body: expected { message: string, history?: [{ role, content }] }");
  return parsed.data;
}

function buildAbort(res: Response): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), getEnv().REQUEST_TIMEOUT_MS);
  const onClose = () => {
    if (!res.writableEnded) controller.abort(new Error("Client disconnected"));
  };
  res.on("close", onClose);
  return { controller, dispose: () => { clearTimeout(timer); res.off("close", onClose); } };
}

async function execute(ctx: RequestContext, message: string, history: Parameters<typeof runChat>[1]): Promise<ChatResponse> {
  const { answer, verdict } = await runWithContext(ctx, () => runChat(message, history));
  const response: ChatResponse = {
    requestId: ctx.requestId,
    answer,
    blocked: verdict.allowed ? null : { category: verdict.category ?? "blocked", reason: verdict.reason ?? "" },
    agents: ctx.artifacts.agents,
    sql: ctx.artifacts.sql,
    sources: ctx.artifacts.sources,
    diagrams: ctx.artifacts.diagrams,
    trace: ctx.trace,
    durationMs: Date.now() - ctx.startedAt,
  };
  logger.info("chat completed", {
    blocked: response.blocked?.category ?? null,
    agents: response.agents,
    sqlQueries: response.sql.length,
    durationMs: response.durationMs,
  });
  return response;
}

export async function chatJson(req: Request, res: Response): Promise<void> {
  const body = parseBody(req);
  const { controller, dispose } = buildAbort(res);
  try {
    const ctx = createContext(res.locals.requestId as string, { signal: controller.signal });
    res.json(await execute(ctx, body.message, body.history));
  } finally {
    dispose();
  }
}

export async function chatStream(req: Request, res: Response): Promise<void> {
  const body = parseBody(req);
  const { controller, dispose } = buildAbort(res);

  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  try {
    const ctx = createContext(res.locals.requestId as string, {
      signal: controller.signal,
      onEvent: (e: TraceEvent) => send("trace", e),
    });
    send("result", await execute(ctx, body.message, body.history));
  } catch (err) {
    if (!controller.signal.aborted || !res.writableEnded) {
      logger.error("chat stream failed", { error: err instanceof Error ? err.message : String(err) });
      send("error", { requestId: res.locals.requestId, message: "Something went wrong while answering. Please try again." });
    }
  } finally {
    clearInterval(heartbeat);
    dispose();
    res.end();
  }
}
