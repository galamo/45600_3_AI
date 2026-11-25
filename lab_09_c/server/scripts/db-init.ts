/**
 * npm run db:init — idempotent database setup.
 *   1. schema.sql + data.sql (drops and recreates the app tables)
 *   2. creates/updates the least-privilege role AGENT_DB_USER
 *   3. GRANTs generated from src/db/access-policy.ts (column-level — password_hash is never granted)
 *   4. verifies the role really cannot read a restricted column
 */
import fs from "node:fs";
import pg from "pg";
import { getEnv } from "../src/config/env.js";
import { ACCESS_POLICY } from "../src/db/access-policy.js";
import { closePools, getAgentPool, getOwnerPool } from "../src/db/pools.js";
import { DATA_SQL, SCHEMA_SQL } from "./paths.js";

async function main() {
  const env = getEnv();
  const pool = getOwnerPool();

  console.log("1/4 schema.sql + data.sql");
  await pool.query(fs.readFileSync(SCHEMA_SQL, "utf8"));
  await pool.query(fs.readFileSync(DATA_SQL, "utf8"));

  console.log(`2/4 role ${env.AGENT_DB_USER}`);
  const client = await pool.connect();
  try {
    const role = client.escapeIdentifier(env.AGENT_DB_USER);
    const password = client.escapeLiteral(env.AGENT_DB_PASSWORD);
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [env.AGENT_DB_USER]);
    await client.query(
      exists.rowCount
        ? `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${password}`
        : `CREATE ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${password}`
    );
    await client.query(`ALTER ROLE ${role} SET default_transaction_read_only = on`);
    await client.query(`ALTER ROLE ${role} SET statement_timeout = ${client.escapeLiteral(`${env.SQL_TIMEOUT_MS}ms`)}`);

    console.log("3/4 grants from access-policy.ts");
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(env.PG_DATABASE)} TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    for (const [table, policy] of Object.entries(ACCESS_POLICY)) {
      const cols = Object.keys(policy.columns).map((c) => client.escapeIdentifier(c)).join(", ");
      await client.query(`GRANT SELECT (${cols}) ON ${client.escapeIdentifier(table)} TO ${role}`);
      console.log(`    ${table}: ${Object.keys(policy.columns).join(", ")}`);
    }
  } finally {
    client.release();
  }

  console.log("4/4 verify");
  const agent = getAgentPool();
  const ok = await agent.query("SELECT count(*)::int AS n FROM users");
  console.log(`    ✓ agent role can read users (${ok.rows[0].n} rows)`);
  try {
    await agent.query("SELECT password_hash FROM users LIMIT 1");
    throw new Error("SECURITY CHECK FAILED: agent role can read users.password_hash");
  } catch (err) {
    if ((err as pg.DatabaseError).code !== "42501") throw err;
    console.log("    ✓ agent role is denied users.password_hash");
  }
  try {
    await agent.query("DELETE FROM resource_booking");
    throw new Error("SECURITY CHECK FAILED: agent role can delete");
  } catch (err) {
    if ((err as Error).message.startsWith("SECURITY")) throw err;
    console.log("    ✓ agent role cannot modify data");
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePools);
