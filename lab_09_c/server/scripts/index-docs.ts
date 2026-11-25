/**
 * npm run index:docs — embeds server/content/*.html (one chunk per <h2> section) into kb_docs
 * for the docs agent's search_docs tool. Idempotent (replaces the table).
 */
import fs from "node:fs";
import path from "node:path";
import { closePools } from "../src/db/pools.js";
import { replaceKnowledgeBase } from "../src/db/vector-store.js";
import { chunkHtml, type Chunk } from "../src/lib/chunking.js";
import { CONTENT_DIR } from "./paths.js";

async function main() {
  const files = fs.existsSync(CONTENT_DIR) ? fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".html")) : [];
  if (!files.length) {
    console.log(`No .html files in ${CONTENT_DIR}`);
    return;
  }
  const chunks: Chunk[] = files.flatMap((f) => {
    const c = chunkHtml(fs.readFileSync(path.join(CONTENT_DIR, f), "utf8"), f);
    console.log(`  ${f}: ${c.length} sections`);
    return c;
  });
  const n = await replaceKnowledgeBase("docs", chunks);
  console.log(`Indexed ${n} chunks into kb_docs.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePools);
