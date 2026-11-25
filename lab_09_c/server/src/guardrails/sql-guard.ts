/**
 * SQL guardrail — deterministic validation of model-written SQL BEFORE it reaches Postgres.
 *
 * Parses the SQL into an AST (node-sql-parser) instead of string-matching "starts with SELECT",
 * which is trivially bypassed (`SELECT 1; DROP TABLE users`, comments, CTEs with DML …).
 *
 * Rules
 *   1. exactly one statement, and it must be a SELECT (CTEs allowed)
 *   2. only tables from ACCESS_POLICY (plus the query's own CTE names)
 *   3. no denied columns (password_hash, ip_address, user_agent)
 *   4. no `*` on tables that contain denied columns — list columns explicitly
 *   5. no server-side functions that touch files, network, settings or time (pg_sleep …)
 *   6. a LIMIT is always enforced by wrapping the query
 *
 * This is layer 1 of 3 — the DB role's GRANTs and a READ ONLY transaction back it up.
 */
import pkg from "node-sql-parser";
import { ACCESS_POLICY, ALLOWED_TABLES, DENIED_COLUMNS } from "../db/access-policy.js";

const { Parser } = pkg;
const parser = new Parser();
const OPT = { database: "PostgresQL" } as const;

/** Tables in the schema that hold denied columns — `SELECT *` on them is rejected. */
const TABLES_WITH_DENIED_COLUMNS = new Set(["users", "audit_login"]);

const FORBIDDEN_FUNCTIONS =
  /\b(pg_[a-z_]+|dblink\w*|lo_[a-z_]+|current_setting|set_config|query_to_xml\w*|xpath|copy|inet_server_\w+|version)\s*\(/i;

const MAX_SQL_CHARS = 4000;

export type SqlCheck = { ok: true; sql: string; limited: string } | { ok: false; reason: string };

/** Strips markdown fences / trailing semicolons the model sometimes adds. */
export function normalizeSql(raw: string): string {
  return raw
    .replace(/^\s*```(?:sql)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
    .replace(/;+\s*$/, "")
    .trim();
}

function tableName(entry: string): string {
  // format: "<op>::<schema|null>::<table>"
  return entry.split("::")[2] ?? "";
}

function cteNames(ast: unknown): Set<string> {
  const names = new Set<string>();
  const withList = (ast as { with?: Array<{ name?: string | { value?: string } }> | null }).with;
  for (const w of withList ?? []) {
    const n = typeof w.name === "string" ? w.name : w.name?.value;
    if (n) names.add(n.toLowerCase());
  }
  return names;
}

export function checkSql(raw: string, maxRows: number): SqlCheck {
  const sql = normalizeSql(raw);
  if (!sql) return { ok: false, reason: "Empty query." };
  if (sql.length > MAX_SQL_CHARS) return { ok: false, reason: `Query too long (> ${MAX_SQL_CHARS} chars).` };
  if (FORBIDDEN_FUNCTIONS.test(sql)) return { ok: false, reason: "Query uses a forbidden server function (pg_*, dblink, settings, files)." };

  let ast;
  try {
    ast = parser.astify(sql, OPT);
  } catch {
    return { ok: false, reason: "Could not parse the query. Write one standard PostgreSQL SELECT statement." };
  }
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) return { ok: false, reason: "Exactly one statement is allowed." };
  const stmt = statements[0]!;
  if (stmt.type !== "select") return { ok: false, reason: `Only SELECT is allowed (got ${String(stmt.type).toUpperCase()}). This assistant is read-only.` };

  const ctes = cteNames(stmt);
  const tables = parser.tableList(sql, OPT).map(tableName).map((t) => t.toLowerCase());
  for (const t of tables) {
    if (!ALLOWED_TABLES.has(t) && !ctes.has(t)) {
      return { ok: false, reason: `Table "${t}" is not accessible. Allowed: ${[...ALLOWED_TABLES].join(", ")}.` };
    }
  }

  const columns = parser.columnList(sql, OPT); // "<op>::<table|null>::<column>"
  for (const entry of columns) {
    const [, table, column = ""] = entry.split("::");
    const col = column.toLowerCase();
    if (DENIED_COLUMNS.has(col)) return { ok: false, reason: `Column "${col}" is restricted and can never be selected.` };
    if (col === "(.*)") {
      const starTables = table && table !== "null" ? [table] : tables;
      const risky = starTables.find((t) => TABLES_WITH_DENIED_COLUMNS.has(t));
      if (risky) {
        const cols = Object.keys(ACCESS_POLICY[risky]?.columns ?? {}).join(", ");
        return { ok: false, reason: `Do not use * on "${risky}" (it has restricted columns). Select explicit columns: ${cols}.` };
      }
    }
  }

  // Enforce a row cap regardless of what the model wrote (+1 row to detect truncation).
  const limited = `SELECT * FROM (\n${sql}\n) AS agent_query LIMIT ${maxRows + 1}`;
  return { ok: true, sql, limited };
}
