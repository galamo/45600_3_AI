/**
 * Lab 9 Ticket MCP server — Streamable HTTP transport.
 * Endpoint: http://localhost:3300/mcp
 * Data is stored in the backend (default http://localhost:4000).
 */
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createTicketMcpServer } from "./create-ticket-server.js";
import { BACKEND_URL } from "./lib/backend-client.js";

const app = express();
app.use(
  cors({
    origin: "*",
    methods: "GET,POST,DELETE,OPTIONS",
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
);
app.use(express.json());

const transports = new Map();

/** Accepts "Authorization: Bearer <token>" or "Authorization: token:<token>". */
function parseAuthFromRequest(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i) || header.match(/^token:(.+)$/i);
  return match ? { token: match[1].trim(), clientId: "lab9", scopes: [] } : undefined;
}

app.post("/mcp", async (req, res) => {
  // The SDK forwards req.auth to tool handlers as extra.authInfo
  req.auth = parseAuthFromRequest(req);
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (req.body?.method) {
      console.log(`[MCP] POST method=${req.body.method}`, sessionId ? `session=${sessionId}` : "new-session");
    }

    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId).handleRequest(req, res, req.body);
      return;
    }
    if (sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or unknown session ID" },
        id: req.body?.id ?? null,
      });
      return;
    }

    const server = createTicketMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => transports.set(sid, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP POST error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err.message || "Internal server error" },
        id: req.body?.id ?? null,
      });
    }
  }
});
console.log("MCP server started");
console.log("MCP server started");
// GET (SSE stream) and DELETE (session termination) for an existing session
const sessionHandler = async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  try {
    await transports.get(sessionId).handleRequest(req, res);
  } catch (err) {
    console.error(`MCP ${req.method} error:`, err);
    if (!res.headersSent) res.status(500).send("MCP session error");
  }
};
app.get("/mcp", sessionHandler);
app.delete("/mcp", sessionHandler);

app.get("/health", (_req, res) => res.json({ ok: true, service: "ticket-mcp", backend: BACKEND_URL }));

const PORT = Number(process.env.MCP_PORT) || 3300;
app.listen(PORT, () => {
  console.log(`Lab 9 Ticket MCP server on http://localhost:${PORT}/mcp (backend: ${BACKEND_URL})`);
});
