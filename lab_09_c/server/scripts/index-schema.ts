/**
 * npm run index:schema — embeds schema.sql (one chunk per table, restricted columns removed)
 * into kb_schema for the SQL agent's search_schema tool. Idempotent (replaces the table).
 */
import fs from "node:fs";
import { closePools } from "../src/db/pools.js";
import { replaceKnowledgeBase } from "../src/db/vector-store.js";
import { chunkSchema } from "../src/lib/chunking.js";
import { SCHEMA_SQL } from "./paths.js";

async function main() {
  const chunks = chunkSchema(fs.readFileSync(SCHEMA_SQL, "utf8"));
  console.log(`schema.sql → ${chunks.length} table chunks: ${chunks.map((c) => c.metadata.table).join(", ")}`);
  const n = await replaceKnowledgeBase("schema", chunks);
  console.log(`Indexed ${n} chunks into kb_schema.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePools);
