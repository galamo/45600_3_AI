/**
 * Mermaid MCP connection — plain logic, no LLM.
 *
 * Uses the official @langchain/mcp-adapters (MCPAdapter) instead of hand-converting JSON-Schema
 * to zod. The connection is optional: without MCP_MERMAID_AUTH the diagram agent still writes
 * Mermaid code itself and the UI renders it.
 *
 * Security: only an explicit allow-list of MCP tools is handed to the model.
 */
import { MCPAdapter } from "@langchain/mcp-adapters";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { getEnv, mermaidAuthHeader } from "../config/env.js";
import { logger, errorFields } from "../lib/logger.js";

/**
 * Explicit allow-list (matched as a suffix, the adapter may prefix the server name).
 * The server exposes more tools (icons, titles, summaries…) — the agent only needs these two,
 * and every extra tool costs prompt tokens and widens what the model can do.
 */
const ALLOWED_TOOLS = ["validate_and_render_mermaid_diagram", "get_mermaid_syntax_document"];
const TOOL_TIMEOUT_MS = 20_000;

let adapter: MCPAdapter | null = null;
let toolsPromise: Promise<DynamicStructuredTool[]> | null = null;

export function isMermaidMcpConfigured(): boolean {
  return mermaidAuthHeader() !== null;
}

/** Lazily connects once and caches the tool list for the life of the process. */
export async function getMermaidMcpTools(): Promise<DynamicStructuredTool[]> {
  const auth = mermaidAuthHeader();
  if (!auth) return [];
  if (!toolsPromise) {
    toolsPromise = (async () => {
      adapter = new MCPAdapter({
        servers: {
          mermaid: {
            transport: "http",
            url: getEnv().MCP_MERMAID_URL,
            headers: { Authorization: auth },
            defaultToolTimeout: TOOL_TIMEOUT_MS,
          },
        },
        onConnectionError: "throw",
      });
      const all = await adapter.getTools();
      const allowed = all.filter((t) => ALLOWED_TOOLS.some((name) => t.name.endsWith(name)));
      logger.info("mermaid mcp connected", { tools: allowed.map((t) => t.name), skipped: all.length - allowed.length });
      return allowed;
    })().catch((err) => {
      logger.warn("mermaid mcp unavailable — diagram agent will work without it", errorFields(err));
      toolsPromise = null; // retry on next request
      return [];
    });
  }
  return toolsPromise;
}

export async function closeMermaidMcp(): Promise<void> {
  await adapter?.close().catch(() => undefined);
  adapter = null;
  toolsPromise = null;
}
