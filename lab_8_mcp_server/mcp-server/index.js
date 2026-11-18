/**
 * Lab 10 Quiz MCP server — Streamable HTTP transport (stateless).
 * Creates a new MCP server + transport on every request; no session cache.
 * Exposes quiz tools (list_topics, get_question, check_answer, add_topic) and a start_quiz prompt.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createQuizMcpServer } from "./create-quiz-server.js";

const app = express();
app.use(
  cors({
    origin: "*",
    methods: "GET,POST,DELETE,OPTIONS",
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
);
app.use(express.json());

app.get("/test", (req,res,next)=>{ return res.send("test is working ")})

function parseAuthFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return undefined;

  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return { token: bearerMatch[1], clientId: "lab10", scopes: [] };
  }

  const tokenMatch = authHeader.match(/^token:(.+)$/i);
  if (tokenMatch) {
    return { token: tokenMatch[1], clientId: "lab10", scopes: [] };
  }

  return undefined;
}

app.post("/mcp", async (req, res) => {
  // req.auth = parseAuthFromRequest(req);
  const server = createQuizMcpServer();
  try {
    const method = req.body?.method;
    if (method) {
      console.log(
        `[MCP] POST method=${method} (stateless)`,
        req.body?.params ? `params=${JSON.stringify(req.body.params)}` : ""
      );
    }
    
    // Stateless mode: no session IDs, new server/transport every request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("MCP POST error:", err);
    await server.close().catch(() => {});
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err.message || "Internal server error" },
        id: req.body?.id ?? null,
      });
    }
  }
});

// Stateless mode has no sessions — GET/DELETE are not used
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode." },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode." },
    id: null,
  });
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "quiz-mcp", mode: "stateless" }));

const PORT = Number(process.env.MCP_PORT) || 3200;
app.listen(PORT, () => {
  console.log(`Lab 10 Quiz MCP server (stateless) on http://localhost:${PORT}/mcp`);
});
