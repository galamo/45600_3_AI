/**
 * DB Executor Agent
 * Inputs: SQL + parameters
 * Output: result set (rows) or error
 */
import { executeQuery } from "../lib/db.js";
import { createLogger, preview } from "../lib/logger.js";

const log = createLogger("DB Executor", "yellow");

/**
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<{ rows: any[], rowCount: number } | { error: string }>}
 */
export async function runQuery(sql, params = []) {
  try {
    const result = await log.time("execute query", () => executeQuery(sql, params));
    log.success(`${result.rowCount} row(s) returned`);
    if (result.rows?.length) log.detail("first row", preview(result.rows[0]));
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err) {
    // The error is returned (not thrown) so the answer agent can explain it to the user.
    return { error: err.message || String(err) };
  }
}
