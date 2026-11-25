/**
 * Request-scoped context (AsyncLocalStorage).
 *
 * Why: agents call tools, tools call services — deep in that call stack we still need to
 *  1. record a trace step (which agent used which tool, how long, ok/error) for the UI, and
 *  2. hand structured artifacts (SQL + rows, diagrams, doc sources) back to the HTTP layer.
 *
 * Structured data must NOT round-trip through LLM text (the model could alter or drop it),
 * so tools write artifacts here and the API response reads them from here.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentName, Artifacts, TraceEvent } from "../types.js";

export interface RequestContext {
  requestId: string;
  startedAt: number;
  trace: TraceEvent[];
  artifacts: Artifacts;
  /** Optional live listener (SSE streaming). */
  onEvent?: (event: TraceEvent) => void;
  signal?: AbortSignal;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function createContext(requestId: string, opts: Pick<RequestContext, "onEvent" | "signal"> = {}): RequestContext {
  return {
    requestId,
    startedAt: Date.now(),
    trace: [],
    artifacts: { sql: [], diagrams: [], sources: [], agents: [] },
    ...opts,
  };
}

export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

let seq = 0;
export function recordEvent(event: Omit<TraceEvent, "id" | "at">): TraceEvent {
  const ctx = currentContext();
  const full: TraceEvent = { id: `e${++seq}`, at: ctx ? Date.now() - ctx.startedAt : 0, ...event };
  if (ctx) {
    ctx.trace.push(full);
    ctx.onEvent?.(full);
  }
  return full;
}

export function markAgentUsed(agent: AgentName): void {
  const ctx = currentContext();
  if (ctx && !ctx.artifacts.agents.includes(agent)) ctx.artifacts.agents.push(agent);
}
