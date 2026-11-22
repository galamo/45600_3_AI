import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initAgent, resetAgent, chat, getToolInfo } from "./agent.js";

const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in .env");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/** Tools currently loaded from the MCP server. */
app.get("/api/tools", async (_req, res) => {
  try {
    await initAgent();
    res.json({ tools: getToolInfo() });
  } catch (err) {
    res.status(503).json({ error: `MCP server unavailable: ${err.message}` });
  }
});

/** Reconnect to MCP and reload tools (e.g. after adding a tool on the server). */
app.post("/api/tools/reload", async (_req, res) => {
  try {
    await resetAgent();
    await initAgent();
    res.json({ tools: getToolInfo() });
  } catch (err) {
    res.status(503).json({ error: `MCP server unavailable: ${err.message}` });
  }
});

/** Body: { messages: [{ role: "user"|"assistant", content: string }] } */
app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20);

  try {
    const result = await chat(clean);
    res.json(result);
  } catch (err) {
    console.error("[chat] error:", err);
    // Connection problems: drop the agent so the next request reconnects
    if (/fetch failed|ECONNREFUSED|session/i.test(err.message)) await resetAgent();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async (err) => {
  if (err) {
    console.error(`Cannot listen on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Ticket agent UI: http://localhost:${PORT}`);
  try {
    await initAgent();
  } catch (err) {
    console.warn(`[agent] MCP not reachable yet (${err.message}). Will retry on first request.`);
  }
});
