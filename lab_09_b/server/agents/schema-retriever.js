/**
 * Schema Retriever (RAG)
 * Input: user question
 * Output: relevant tables/columns/relations + short notes
 * First step of the SQL agent pipeline: the SQL generator only sees what this returns.
 */
import { getSchemaVectorStore } from "../lib/schema-vector-store.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("Schema Retriever", "yellow");

export async function retrieveSchemaContext(question, k = 10) {
  const store = await log.time("connect to vector store schema_vectors", () => getSchemaVectorStore());
  // With scores so the log shows how relevant each schema chunk is (cosine distance, lower = closer).
  const results = await log.time(`similarity search (k=${k})`, () => store.similaritySearchWithScore(question, k));
  log.chunks("schema_vectors", k, results);
  const docs = results.map(([doc]) => doc);
  const parts = docs.map((d) => d.pageContent);
  const notes = docs.length
    ? "Relevant schema excerpts (tables, columns, relations):"
    : "No schema context found. Available tables: users, permissions, users_permissions, audit_login.";
  if (!docs.length) log.warn(notes);
  const tables = [...new Set(docs.map((d) => d.metadata?.table).filter(Boolean))];
  if (tables.length) log.info(`tables in context: ${tables.join(", ")}`);
  return {
    schemaContext: parts.join("\n\n---\n\n"),
    notes,
    sources: docs.map((d) => ({ table: d.metadata?.table, type: d.metadata?.type })),
  };
}
