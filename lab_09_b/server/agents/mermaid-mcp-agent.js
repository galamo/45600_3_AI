/**
 * Mermaid MCP Agent: connects to the Mermaid MCP server (Streamable HTTP with auth)
 * and exposes its tools to a LangChain agent. Used as a router tool for diagram requests.
 *
 * Requires in .env: MCP_MERMAID_URL (e.g. https://mcp.mermaid.ai/mcp), MCP_MERMAID_AUTH (Bearer token).
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAgent, HumanMessage } from "langchain";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createChatModel } from "../lib/llm.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("Mermaid MCP Agent", "cyan");

const MCP_MERMAID_URL = process.env.MCP_MERMAID_URL || "https://mcp.mermaid.ai/mcp";
const MCP_MERMAID_AUTH = process.env.MCP_MERMAID_AUTH || "";

function createModel() {
  return createChatModel({
    model: process.env.TESTING_MODEL || "openai/gpt-4o-mini",
    temperature: 0,
  });
}

/**
 * Convert MCP tool inputSchema (JSON Schema) to a Zod object for LangChain.
 */
function mcpInputSchemaToZod(jsonSchema) {
  if (!jsonSchema || typeof jsonSchema !== "object") return z.object({});
  const props = jsonSchema.properties;
  const required = new Set(jsonSchema.required || []);
  if (!props || typeof props !== "object") return z.object({});
  const shape = {};
  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") {
      shape[key] = z.any().optional().nullable();
      continue;
    }
    let field = z.any();
    switch (prop.type) {
      case "string":
        field = z.string();
        break;
      case "number":
      case "integer":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]));
        break;
      case "object":
        field = z.record(z.any());
        break;
      default:
        field = z.any();
    }
    if (!required.has(key)) field = field.optional().nullable();
    shape[key] = field;
  }
  return z.object(shape);
}

/**
 * Build LangChain tools from a connected MCP client (tools/list + tools/call).
 */
async function getMcpToolsAsLangChain(mcpClient) {
  const { tools } = await mcpClient.listTools();
  return tools.map((t) => {
    const name = t.name;
    const description = t.description ?? `Call MCP tool: ${name}`;
    const schema = mcpInputSchemaToZod(t.inputSchema);
    return new DynamicStructuredTool({
      name,
      description,
      schema,
      func: async (args) => {
        // Each MCP tools/call the agent makes is logged with its args, duration and result size.
        const t0 = log.toolCall(`mcp:${name}`, args);
        try {
          const result = await mcpClient.callTool({ name, arguments: args });
          const texts = (result.content || [])
            .filter((c) => c.type === "text")
            .map((c) => c.text);
          const output = texts.join("\n") || JSON.stringify(result);
          if (result.isError) log.warn(`mcp:${name} reported an error`);
          log.toolResult(`mcp:${name}`, t0, `${output.length} chars · ${output}`);
          return output;
        } catch (err) {
          log.error(`mcp:${name} failed after ${Date.now() - t0}ms: ${err.message}`);
          throw err;
        }
      },
    });
  });
}

const SYSTEM_PROMPT = `You are a diagram assistant with access to the Mermaid MCP server.
Use the available MCP tools to create, validate, or repair Mermaid diagrams for the user's request.
Return concise Markdown and include any Mermaid source in a \`\`\`mermaid code fence.`;

/** Text of the last AI message (content may be a string or content blocks). */
function finalText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.getType?.() !== "ai" && m?._getType?.() !== "ai" && m?.type !== "ai") continue;
    const text =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .map((b) => (typeof b === "string" ? b : b?.type === "text" ? String(b.text ?? "") : ""))
              .join("")
          : "";
    if (text.trim()) return text.trim();
  }
  return "";
}

/**
 * Run the Mermaid MCP agent for one question. Connects to Mermaid MCP, fetches tools, runs agent.
 * @param {string} question - User question (e.g. "Draw a flowchart for login" or "Generate a sequence diagram for API call")
 * @returns {Promise<{ answer: string, error?: string }>}
 */
export async function runMermaidMcpAgent(question) {
  const startedAt = log.start(question);
  if (!MCP_MERMAID_AUTH) {
    log.warn("MCP_MERMAID_AUTH not set; skipping");
    log.end(startedAt, "not configured");
    return {
      answer: "Mermaid MCP is not configured. Set MCP_MERMAID_URL and MCP_MERMAID_AUTH in .env (see .env.example).",
      error: "MCP_MERMAID_AUTH not set",
    };
  }

  const requestInit = {
    headers: {
      Authorization: MCP_MERMAID_AUTH,
      "Content-Type": "application/json",
    },
  };

  const transport = new StreamableHTTPClientTransport(new URL(MCP_MERMAID_URL), { requestInit });
  const client = new Client(
    { name: "lab-09-b-mermaid-agent", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await log.time(`connect to MCP ${MCP_MERMAID_URL}`, () => client.connect(transport));
  } catch (err) {
    log.end(startedAt, "connection failed");
    return {
      answer: `Could not connect to Mermaid MCP: ${err.message}. Check MCP_MERMAID_URL and MCP_MERMAID_AUTH.`,
      error: err.message,
    };
  }

  try {
    const tools = await log.time("MCP tools/list", () => getMcpToolsAsLangChain(client));
    log.info(`${tools.length} MCP tool(s): ${tools.map((t) => t.name).join(", ")}`);
    if (!tools.length) {
      log.end(startedAt, "no tools");
      return { answer: "Mermaid MCP server reported no tools." };
    }

    const agent = createAgent({
      model: createModel(),
      tools,
      systemPrompt: SYSTEM_PROMPT,
    });

    const result = await log.time("createAgent invoke", () =>
      agent.invoke({ messages: [new HumanMessage(question)] }, { recursionLimit: 15 })
    );
    const answer = finalText(result.messages ?? []);
    log.end(startedAt, answer);
    return { answer };
  } catch (err) {
    log.error(`agent failed: ${err.message}`);
    log.end(startedAt, "error");
    throw err;
  } finally {
    await transport.close();
  }
}
