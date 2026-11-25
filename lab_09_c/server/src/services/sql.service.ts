/**
 * Read-only SQL execution — plain logic, no LLM.
 *
 * Layers applied here (in order):
 *   1. checkSql()          AST validation + LIMIT wrap           (app)
 *   2. BEGIN READ ONLY     + SET LOCAL statement_timeout          (transaction)
 *   3. agentPool           least-privilege role, column GRANTs    (database)
 *   4. sanitizeRow()       drops denied keys, masks secrets        (output)
 */
import { getEnv } from "../config/env.js";
import { getAgentPool } from "../db/pools.js";
import { checkSql } from "../guardrails/sql-guard.js";
import { sanitizeRow } from "../guardrails/output-guard.js";
import type { SqlArtifact } from "../types.js";

/** Postgres errors are useful to the agent (it can fix its query) but we keep them short. */
function friendlyDbError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e.code === "42501") return `Permission denied: ${e.message ?? ""}. You may only read the allowed columns (call list_tables).`;
  if (e.code === "57014") return "Query cancelled: it exceeded the time limit. Simplify it.";
  if (e.code === "28P01" || e.code === "28000")
    return "The SQL agent database role is not set up. Run `npm run db:init` in server/.";
  return (e.message ?? String(err)).split("\n")[0]!.slice(0, 300);
}

export async function executeReadOnlySql(rawSql: string): Promise<SqlArtifact> {
  const env = getEnv();
  const check = checkSql(rawSql, env.SQL_MAX_ROWS);
  if (!check.ok) {
    return { query: rawSql.trim(), rowCount: null, columns: [], rows: [], truncated: false, error: `Rejected by SQL guard: ${check.reason}` };
  }

  const client = await getAgentPool().connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(env.SQL_TIMEOUT_MS)}`);
    const result = await client.query(check.limited);
    await client.query("ROLLBACK");

    const truncated = result.rows.length > env.SQL_MAX_ROWS;
    const rows = result.rows.slice(0, env.SQL_MAX_ROWS).map(sanitizeRow);
    return {
      query: check.sql,
      rowCount: rows.length,
      columns: result.fields.map((f) => f.name),
      rows,
      truncated,
      error: null,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    return { query: check.sql, rowCount: null, columns: [], rows: [], truncated: false, error: friendlyDbError(err) };
  } finally {
    client.release();
  }
}
