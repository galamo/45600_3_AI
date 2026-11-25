/**
 * SQL Generator Agent
 * Inputs: question + retrieved schema context
 * Output: SQL query only (and optionally parameters)
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel } from "../lib/llm.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("SQL Generator", "blue");

function createModel() {
  return createChatModel({
    model: process.env.SQL_BASED_MODEL || "openai/gpt-4o-mini",
    temperature: 0,
  });
}

const SYSTEM_PROMPT = `You are a PostgreSQL expert. Given a user question and the relevant database schema, output ONLY a valid PostgreSQL SELECT query. No explanation, no markdown, no code block wrapper.
Rules:
- Use only the tables/columns mentioned in the schema context.
- Prefer JOINs over subqueries when listing related data.
- Use table aliases if helpful (e.g. u for users, p for permissions).
- Return only one SQL statement.
- Do not use INSERT, UPDATE, DELETE, or DDL. Only SELECT.`;

/**
 * @param {string} question
 * @param {string} schemaContext
 * @returns {Promise<{ sql: string, parameters?: any[] }>}
 */
export async function generateSQL(question, schemaContext) {
  const model = createModel();
  const messages = [
    new SystemMessage({
      content: SYSTEM_PROMPT + "\n\nSchema context:\n" + schemaContext,
    }),
    new HumanMessage({ content: question }),
  ];
  log.info(`schema context: ${schemaContext.length} chars`);
  const response = await log.llm("generate SQL", model, messages);
  let sql = typeof response.content === "string" ? response.content : response.content?.map((c) => (c.type === "text" ? c.text : "")).join("") || "";
  sql = sql.replace(/^```\w*\n?/i, "").replace(/\n?```$/i, "").trim();
  if (sql) log.block("sql", sql);
  return { sql, parameters: [] };
}
