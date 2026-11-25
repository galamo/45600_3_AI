/**
 * SQL Agent pipeline: create query from context and run it.
 * 1. Schema Retriever (RAG) -> schema context
 * 2. SQL Generator -> SQL
 * 3. DB Executor -> rows or error
 * 4. Answer Agent -> natural language
 */
import { retrieveSchemaContext } from "./schema-retriever.js";
import { generateSQL } from "./sql-generator.js";
import { runQuery } from "./db-executor.js";
import { answer } from "./answer-agent.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("SQL Agent", "blue");

/**
 * Run the full SQL agent: retrieve schema, generate SQL, execute, answer.
 * @param {string} question
 * @returns {Promise<{ answer: string, sql: string | null, rows: any[] | null, rowCount: number | null, error: string | null }>}
 */
export async function runSqlAgent(question) {
  const startedAt = log.start(question);

  log.step("step 1/4 · schema retrieval (RAG)");
  const { schemaContext } = await retrieveSchemaContext(question);

  log.step("step 2/4 · SQL generation");
  const { sql } = await generateSQL(question, schemaContext);

  if (!sql) {
    log.warn("no SQL generated; stopping");
    log.end(startedAt, "no SQL");
    return {
      answer: "I couldn't generate a SQL query for that question.",
      sql: null,
      rows: null,
      rowCount: null,
      error: null,
    };
  }

  log.step("step 3/4 · DB execution");
  const execution = await runQuery(sql, []); //this is not agent its only an helper 

  log.step("step 4/4 · answer generation");
  const naturalAnswer = await answer(question, execution, sql);

  log.end(startedAt, naturalAnswer);
  return {
    answer: naturalAnswer,
    sql,
    rows: "rows" in execution ? execution.rows : null,
    rowCount: "rowCount" in execution ? execution.rowCount : null,
    error: "error" in execution ? execution.error : null,
  };
}
