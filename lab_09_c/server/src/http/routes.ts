/**
 * Route table. Rate limiting applies to the expensive (LLM) endpoints only.
 */
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getEnv } from "../config/env.js";
import { getOwnerPool } from "../db/pools.js";
import { GRAPH_DESCRIPTION } from "../graph/chat.graph.js";
import { isMermaidMcpConfigured } from "../services/mermaid-mcp.service.js";
import { chatJson, chatStream } from "./chat.controller.js";

export function apiRouter(): Router {
  const env = getEnv();
  const router = Router();

  const llmLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_PER_MINUTE,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: `Too many requests — limit is ${env.RATE_LIMIT_PER_MINUTE} per minute.` },
  });

  router.post("/chat", llmLimiter, chatJson);
  router.post("/chat/stream", llmLimiter, chatStream);

  router.get("/health", async (_req, res) => {
    let db = false;
    try {
      await getOwnerPool().query("SELECT 1");
      db = true;
    } catch {
      db = false;
    }
    res.status(db ? 200 : 503).json({ ok: db, db, mermaidMcp: isMermaidMcpConfigured() });
  });

  /** Static description of the system for the UI sidebar (no secrets). */
  router.get("/meta", (_req, res) => {
    res.json({
      graph: GRAPH_DESCRIPTION,
      models: { supervisor: env.TESTING_MODEL, docs: env.TESTING_MODEL, sql: env.SQL_BASED_MODEL, diagram: env.TESTING_MODEL },
      mermaidMcp: isMermaidMcpConfigured(),
      agents: [
        { name: "supervisor", tools: ["ask_docs_agent", "ask_sql_agent", "ask_diagram_agent"] },
        { name: "docs_agent", tools: ["search_docs"] },
        { name: "sql_agent", tools: ["list_tables", "search_schema", "run_readonly_sql"] },
        { name: "diagram_agent", tools: ["list_tables", "search_docs", ...(isMermaidMcpConfigured() ? ["mermaid MCP"] : [])] },
      ],
      limits: { maxQuestionChars: env.MAX_QUESTION_CHARS, maxHistoryTurns: env.MAX_HISTORY_TURNS, sqlMaxRows: env.SQL_MAX_ROWS },
    });
  });

  return router;
}
