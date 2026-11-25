/**
 * API contract (validated with zod at the edge — nothing unvalidated reaches the graph).
 */
import { z } from "zod";
import type { AgentName, SourceArtifact, SqlArtifact, TraceEvent } from "../types.js";

export const ChatRequestSchema = z.object({
  /** Hard transport cap; the input guard applies the (smaller) MAX_QUESTION_CHARS policy. */
  message: z.string().max(8000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(40)
    .default([]),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
  requestId: string;
  answer: string;
  blocked: { category: string; reason: string } | null;
  agents: AgentName[];
  sql: SqlArtifact[];
  sources: SourceArtifact[];
  diagrams: string[];
  trace: TraceEvent[];
  durationMs: number;
}
