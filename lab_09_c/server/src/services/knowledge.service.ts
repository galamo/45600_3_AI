/**
 * Retrieval over the two knowledge bases — plain logic, no LLM.
 */
import { similaritySearch, type KbHit } from "../db/vector-store.js";

/** Below this cosine similarity a chunk is noise — better to say "not found" than to hallucinate. */
const DOCS_MIN_SCORE = 0.25;
const SCHEMA_MIN_SCORE = 0.15;

export interface RetrievedChunk {
  source: string;
  score: number;
  content: string;
}

const toChunk = (h: KbHit): RetrievedChunk => ({
  source: String(h.metadata.table ?? h.metadata.source ?? "unknown"),
  score: Math.round(h.score * 1000) / 1000,
  content: h.content,
});

export async function searchDocs(query: string, k = 5): Promise<RetrievedChunk[]> {
  return (await similaritySearch("docs", query, k, DOCS_MIN_SCORE)).map(toChunk);
}

export async function searchSchema(query: string, k = 6): Promise<RetrievedChunk[]> {
  return (await similaritySearch("schema", query, k, SCHEMA_MIN_SCORE)).map(toChunk);
}

/**
 * Wraps retrieved text in explicit delimiters. Retrieved content is DATA, not instructions —
 * the prompts tell the model to ignore any instructions found inside <document> tags
 * (indirect prompt-injection defense).
 */
export function formatChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "NO_RELEVANT_DOCUMENTS";
  return chunks
    .map((c, i) => `<document index="${i + 1}" source="${c.source}" score="${c.score}">\n${c.content}\n</document>`)
    .join("\n");
}
