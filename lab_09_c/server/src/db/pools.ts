/**
 * Two connection pools with different privileges:
 *
 *  ownerPool  — the DB owner (PG_USER). Used by setup scripts and the vector stores.
 *               Never exposed to model-generated SQL.
 *  agentPool  — AGENT_DB_USER, a read-only role with column-level GRANTs (see db-init.ts).
 *               The ONLY pool that ever runs SQL written by an LLM.
 */
import pg from "pg";
import { getEnv } from "../config/env.js";
import { logger, errorFields } from "../lib/logger.js";

let ownerPool: pg.Pool | null = null;
let agentPool: pg.Pool | null = null;

function base() {
  const env = getEnv();
  return { host: env.PG_HOST, port: env.PG_PORT, database: env.PG_DATABASE, connectionTimeoutMillis: 5000 };
}

export function getOwnerPool(): pg.Pool {
  if (!ownerPool) {
    const env = getEnv();
    ownerPool = new pg.Pool({ ...base(), user: env.PG_USER, password: env.PG_PASSWORD, max: 5 });
    ownerPool.on("error", (err) => logger.error("owner pool error", errorFields(err)));
  }
  return ownerPool;
}

export function getAgentPool(): pg.Pool {
  if (!agentPool) {
    const env = getEnv();
    agentPool = new pg.Pool({
      ...base(),
      user: env.AGENT_DB_USER,
      password: env.AGENT_DB_PASSWORD,
      max: 5,
      // Server-side guard even if a statement slips past the transaction settings.
      statement_timeout: env.SQL_TIMEOUT_MS,
      application_name: "lab09c-sql-agent",
    });
    agentPool.on("error", (err) => logger.error("agent pool error", errorFields(err)));
  }
  return agentPool;
}

export async function closePools(): Promise<void> {
  await Promise.allSettled([ownerPool?.end(), agentPool?.end()]);
  ownerPool = agentPool = null;
}
