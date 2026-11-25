/**
 * run_readonly_sql — the only tool that touches application data.
 * The tool returns a compact preview to the model; the full (capped) result goes to the
 * request artifacts for the UI, so large tables never inflate the prompt.
 */
import { z } from "zod";
import { currentContext } from "../lib/request-context.js";
import { executeReadOnlySql } from "../services/sql.service.js";
import { tracedTool } from "./traced-tool.js";

const ROWS_FOR_MODEL = 30;

export function createRunSqlTool() {
  return tracedTool(
    "sql_agent",
    {
      name: "run_readonly_sql",
      description:
        "Executes ONE read-only PostgreSQL SELECT against the SSO database and returns JSON { ok, columns, rowCount, rows, truncated, error }. " +
        "Queries are validated: only allowed tables/columns, no SELECT * on users/audit_login, no DML/DDL, row limit enforced. " +
        "If ok=false, read the error, fix the query and try again.",
      schema: z.object({
        sql: z.string().min(6).max(4000).describe("A single PostgreSQL SELECT statement (no trailing semicolon needed)"),
        purpose: z.string().max(200).describe("One short sentence: what this query answers"),
      }),
      describeCall: ({ purpose }) => purpose,
    },
    async ({ sql }) => {
      const result = await executeReadOnlySql(sql);
      currentContext()?.artifacts.sql.push(result);

      const payload = {
        ok: result.error === null,
        columns: result.columns,
        rowCount: result.rowCount,
        rows: result.rows.slice(0, ROWS_FOR_MODEL),
        truncated: result.truncated || (result.rowCount ?? 0) > ROWS_FOR_MODEL,
        error: result.error,
      };
      return {
        output: JSON.stringify(payload),
        status: result.error ? "error" : "ok",
        detail: result.error ? result.error.slice(0, 140) : `${result.rowCount} row(s)${result.truncated ? " (capped)" : ""}`,
      };
    }
  );
}
