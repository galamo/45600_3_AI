/**
 * Ticket agent: LangChain createAgent + OpenRouter model + tools loaded
 * dynamically from the Lab 9 ticket MCP server.
 */
import { createAgent } from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const MCP_URL = process.env.MCP_URL || "http://localhost:3300/mcp";

const SYSTEM_PROMPT = `You are a helpful assistant for a ticket management system.
Answer questions about tickets, users, projects and sprints by calling the available tools.
- Always use tools to get real data; never invent ticket ids, users or statuses.
- Valid statuses: open, in_progress, in_review, done, closed.
- Before deleting or closing a ticket, make sure you identified the right ticket.
- Keep answers short and clear. Use bullet lists or tables for multiple tickets.
- If a tool returns an error, explain it to the user in plain words.`;

/** "openrouter:gpt-5.4" -> "openai/gpt-5.4", "openrouter:anthropic/x" -> "anthropic/x" */
function resolveModelId(ref = "openrouter:gpt-5.4") {
  const id = ref.replace(/^openrouter:/, "");
  return id.includes("/") ? id : `openai/${id}`;
}

let state = null; // { client, agent, tools, token }

/**
 * Connects to the MCP server with the given JWT, loads its tools and builds the agent.
 * Reuses the existing agent when the token is unchanged.
 */
export async function initAgent(token) {
  if (!token) throw new Error("Not authenticated. Log in to get a JWT.");
  if (state?.token === token) return state;
  if (state) await resetAgent();

  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    mcpServers: {
      tickets: {
        transport: "http",
        url: MCP_URL,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  });

  // Tools are discovered at runtime from the MCP server (tools/list)
  const tools = await client.getTools();

  const model = new ChatOpenRouter({
    model: resolveModelId(process.env.OPENROUTER_MODEL),
    temperature: 0,
  });

  const agent = createAgent({ model, tools, systemPrompt: SYSTEM_PROMPT });

  state = { client, agent, tools, token };
  console.log(`[agent] connected to ${MCP_URL}, loaded tools: ${tools.map((t) => t.name).join(", ")}`);
  return state;
}

/** Drops the current agent so the next call reconnects and reloads tools. */
export async function resetAgent() {
  if (state) await state.client.close().catch(() => {});
  state = null;
}

export function getToolInfo() {
  return (state?.tools ?? []).map((t) => ({ name: t.name, description: t.description }));
}

/**
 * Runs the agent on a chat history using the caller's JWT for MCP.
 * @param {{role: "user"|"assistant", content: string}[]} messages
 * @param {string} token MCP Bearer JWT
 */
export async function chat(messages, token) {
  const { agent } = await initAgent(token);
  const result = await agent.invoke({ messages });

  const out = result.messages;
  const startIdx = messages.length;
  const toolCalls = out
    .slice(startIdx)
    .flatMap((m) => m.tool_calls ?? [])
    .map((c) => ({ name: c.name, args: c.args }));

  const last = out[out.length - 1];
  const reply =
    typeof last.content === "string"
      ? last.content
      : last.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

  return { reply, toolCalls };
}
