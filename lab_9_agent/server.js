import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initAgent, resetAgent, chat, getToolInfo } from "./agent.js";

const PORT = process.env.PORT || 5000;
const MCP_URL = process.env.MCP_URL || "http://localhost:3300/mcp";
const MCP_AUTH_URL =
  process.env.MCP_AUTH_URL || MCP_URL.replace(/\/mcp\/?$/, "/auth");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in .env");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/** Extract Bearer JWT from Authorization header. */
function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Log in first." });
  }
  req.mcpToken = token;
  next();
}

/**
 * Login against the ticket MCP server (POST /auth).
 * Body: { username, password } → { token, role }
 */
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  try {
    const upstream = await fetch(MCP_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.error || "Access denied",
      });
    }
    // Drop any prior MCP session so the next call uses the new JWT
    await resetAgent();
    res.json({
      token: data.token,
      role: data.role,
      username,
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(503).json({
      error: `MCP auth unavailable (${MCP_AUTH_URL}): ${err.message}`,
    });
  }
});

/** Client logout — drop the in-memory MCP agent session. */
app.post("/api/auth/logout", async (_req, res) => {
  await resetAgent();
  res.json({ ok: true });
});

/** Confirm the JWT can open an MCP session and list tools. */
app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    await initAgent(req.mcpToken);
    res.json({ ok: true, tools: getToolInfo().map((t) => t.name) });
  } catch (err) {
    await resetAgent();
    const status = /401|Unauthorized/i.test(err.message) ? 401 : 503;
    res.status(status).json({ error: err.message });
  }
});

/** Tools currently loaded from the MCP server. */
app.get("/api/tools", requireAuth, async (req, res) => {
  try {
    await initAgent(req.mcpToken);
    res.json({ tools: getToolInfo() });
  } catch (err) {
    const status = /401|Unauthorized/i.test(err.message) ? 401 : 503;
    res.status(status).json({ error: `MCP server unavailable: ${err.message}` });
  }
});

/** Reconnect to MCP and reload tools (e.g. after adding a tool on the server). */
app.post("/api/tools/reload", requireAuth, async (req, res) => {
  try {
    await resetAgent();
    await initAgent(req.mcpToken);
    res.json({ tools: getToolInfo() });
  } catch (err) {
    const status = /401|Unauthorized/i.test(err.message) ? 401 : 503;
    res.status(status).json({ error: `MCP server unavailable: ${err.message}` });
  }
});

/** Body: { messages: [{ role: "user"|"assistant", content: string }] } */
app.post("/api/chat", requireAuth, async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20);

  try {
    const result = await chat(clean, req.mcpToken);
    res.json(result);
  } catch (err) {
    console.error("[chat] error:", err);
    if (/fetch failed|ECONNREFUSED|session|Unauthorized|401/i.test(err.message)) {
      await resetAgent();
    }
    const status = /401|Unauthorized/i.test(err.message) ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.listen(PORT, (err) => {
  if (err) {
    console.error(`Cannot listen on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Ticket agent UI: http://localhost:${PORT}`);
  console.log(`Auth via MCP:   ${MCP_AUTH_URL}`);
});
