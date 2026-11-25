/**
 * Lab 09 b Multi-Agent server: router uses each agent as a tool.
 * The LLM chooses which tool to call (HTML RAG or SQL agent); no if/else dispatch in code.
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { routeWithTools } from "./agents/router-agent.js";
import { banner, color, preview, runWithRequestContext } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.json());
// let mermiad answer which avilable tools exists?
app.post("/query", async (req, res) => {
  const { question } = req.body || {};
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'question' in body" });
  }

  // Every log line inside this callback carries the same request id and elapsed time.
  await runWithRequestContext(async (ctx) => {
    banner(`NEW REQUEST ${ctx.id}`, [
      `${color.gray("time    :")} ${new Date(ctx.start).toISOString()}`,
      `${color.gray("question:")} ${color.bold(question)}`,
    ]);
    try {
      const result = await routeWithTools(question);
      banner(`REQUEST ${ctx.id} DONE in ${Date.now() - ctx.start}ms`, [
        `${color.gray("route   :")} ${color.bold(result.route)}`,
        ...(result.rowCount != null ? [`${color.gray("rows    :")} ${result.rowCount}`] : []),
        ...(result.error ? [`${color.gray("error   :")} ${color.red(result.error)}`] : []),
        `${color.gray("answer  :")} ${preview(result.answer, 200)}`,
      ], color.green);
      res.json(result);
    } catch (err) {
      banner(`REQUEST ${ctx.id} FAILED after ${Date.now() - ctx.start}ms`, [color.red(err.stack || String(err))], color.red);
      res.status(500).json({ error: err.message || String(err) });
    }
  });
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.use(express.static(clientDist));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () =>
  banner("Lab 09 b Multi-Agent server (router with tools)", [
    `${color.gray("url  :")} http://localhost:${PORT}`,
    `${color.gray("tools:")} answer_with_html_rag · run_sql_agent · use_mermaid_diagram`,
  ])
);
