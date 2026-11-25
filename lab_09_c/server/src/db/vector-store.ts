/**
 * Tiny pgvector store (no framework magic): one table per knowledge base.
 *   kb_docs    — chunks of server/content/*.html  (docs agent)
 *   kb_schema  — chunks of db/001_schema.sql       (sql agent)
 *
 * Table names are constants from this file — never user input.
 */
import { randomUUID } from "node:crypto";
import { getEnv } from "../config/env.js";
import { getEmbeddings } from "../lib/llm.js";
import { getOwnerPool } from "./pools.js";

export const KB_TABLES = { docs: "kb_docs", schema: "kb_schema" } as const;
export type KnowledgeBase = keyof typeof KB_TABLES;

export interface KbDocument {
  content: string;
  metadata: Record<string, unknown>;
}

export interface KbHit extends KbDocument {
  /** cosine similarity, 0..1 */
  score: number;
}

const toVector = (v: number[]) => `[${v.join(",")}]`;

export async function ensureKnowledgeBase(kb: KnowledgeBase): Promise<void> {
  const dim = getEnv().EMBEDDING_DIMENSION;
  const pool = getOwnerPool();
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${KB_TABLES[kb]} (
       id uuid PRIMARY KEY,
       content text NOT NULL,
       metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
       embedding vector(${dim}) NOT NULL
     )`
  );
}

/** Idempotent re-index: replaces the whole knowledge base in one transaction. */
export async function replaceKnowledgeBase(kb: KnowledgeBase, docs: KbDocument[]): Promise<number> {
  await ensureKnowledgeBase(kb);
  const vectors = await getEmbeddings().embedDocuments(docs.map((d) => d.content));
  const client = await getOwnerPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${KB_TABLES[kb]}`);
    for (const [i, doc] of docs.entries()) {
      await client.query(
        `INSERT INTO ${KB_TABLES[kb]} (id, content, metadata, embedding) VALUES ($1, $2, $3, $4::vector)`,
        [randomUUID(), doc.content, doc.metadata, toVector(vectors[i]!)]
      );
    }
    await client.query("COMMIT");
    return docs.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function similaritySearch(kb: KnowledgeBase, query: string, k: number, minScore = 0): Promise<KbHit[]> {
  const vector = await getEmbeddings().embedQuery(query);
  const { rows } = await getOwnerPool().query<{ content: string; metadata: Record<string, unknown>; score: number }>(
    `SELECT content, metadata, 1 - (embedding <=> $1::vector) AS score
       FROM ${KB_TABLES[kb]}
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [toVector(vector), k]
  );
  return rows.filter((r) => r.score >= minScore).map((r) => ({ ...r, score: Number(r.score) }));
}
