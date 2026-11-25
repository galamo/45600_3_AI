/**
 * tracedTool — the one way tools are created in this lab.
 *
 * Wraps LangChain's `tool()` so that every tool call:
 *   • is recorded in the request trace (agent, tool, duration, ok/error) → shown live in the UI
 *   • never throws into the agent loop: failures become a short error string the model can
 *     read and recover from (e.g. fix its SQL), instead of crashing the whole request.
 */
import { tool } from "langchain";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { z } from "zod";
import { recordEvent } from "../lib/request-context.js";
import { logger, errorFields } from "../lib/logger.js";
import type { AgentName } from "../types.js";

export interface ToolResult {
  /** What the model reads. */
  output: string;
  /** Short line for the UI trace. */
  detail?: string;
  status?: "ok" | "error";
}

interface TracedToolConfig<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** One-line summary of the call arguments for the trace. */
  describeCall?: (args: z.infer<S>) => string;
}

export function tracedTool<S extends z.ZodType>(
  agent: AgentName,
  cfg: TracedToolConfig<S>,
  run: (args: z.infer<S>) => Promise<ToolResult>
): DynamicStructuredTool {
  const fn = async (args: z.infer<S>): Promise<string> => {
    const started = Date.now();
    recordEvent({ kind: "tool_start", agent, name: cfg.name, detail: cfg.describeCall?.(args) });
    try {
      const res = await run(args);
      recordEvent({
        kind: "tool_end",
        agent,
        name: cfg.name,
        status: res.status ?? "ok",
        detail: res.detail,
        durationMs: Date.now() - started,
      });
      return res.output;
    } catch (err) {
      logger.error("tool failed", { tool: cfg.name, agent, ...errorFields(err) });
      const message = err instanceof Error ? err.message : String(err);
      recordEvent({ kind: "tool_end", agent, name: cfg.name, status: "error", detail: message.slice(0, 160), durationMs: Date.now() - started });
      return `TOOL_ERROR: ${message.slice(0, 300)}`;
    }
  };
  return tool(fn as never, { name: cfg.name, description: cfg.description, schema: cfg.schema as never }) as unknown as DynamicStructuredTool;
}

/** Re-wraps an existing tool (e.g. loaded from MCP) so its calls show up in the trace too. */
export function traceExistingTool(agent: AgentName, inner: DynamicStructuredTool): DynamicStructuredTool {
  return tool(
    (async (args: unknown) => {
      const started = Date.now();
      recordEvent({ kind: "tool_start", agent, name: inner.name, detail: "via MCP" });
      try {
        const out = await inner.invoke(args as never);
        const text = typeof out === "string" ? out : JSON.stringify(out);
        recordEvent({ kind: "tool_end", agent, name: inner.name, status: "ok", durationMs: Date.now() - started });
        return text.slice(0, 4000);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        recordEvent({ kind: "tool_end", agent, name: inner.name, status: "error", detail: message.slice(0, 160), durationMs: Date.now() - started });
        return `TOOL_ERROR: ${message.slice(0, 300)}`;
      }
    }) as never,
    { name: inner.name, description: inner.description, schema: inner.schema as never }
  ) as unknown as DynamicStructuredTool;
}
