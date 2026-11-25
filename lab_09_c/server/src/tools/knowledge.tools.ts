/**
 * Knowledge tools — retrieval + data-access policy. Thin adapters over services.
 */
import { z } from "zod";
import { describePolicy } from "../db/access-policy.js";
import { currentContext } from "../lib/request-context.js";
import { formatChunks, searchDocs, searchSchema } from "../services/knowledge.service.js";
import type { AgentName } from "../types.js";
import { tracedTool } from "./traced-tool.js";

export function createSearchDocsTool(agent: AgentName) {
  return tracedTool(
    agent,
    {
      name: "search_docs",
      description:
        "Semantic search over the SSO product documentation / FAQ. Returns the most relevant excerpts wrapped in <document> tags, or NO_RELEVANT_DOCUMENTS.",
      schema: z.object({
        query: z.string().min(2).max(300).describe("A focused search query, e.g. 'how login works'"),
      }),
      describeCall: ({ query }) => `“${query}”`,
    },
    async ({ query }) => {
      const chunks = await searchDocs(query);
      const ctx = currentContext();
      for (const c of chunks) {
        if (ctx && !ctx.artifacts.sources.some((s) => s.source === c.source && s.excerpt === c.content.slice(0, 220))) {
          ctx.artifacts.sources.push({ source: c.source, score: c.score, excerpt: c.content.slice(0, 220) });
        }
      }
      return {
        output: formatChunks(chunks),
        detail: chunks.length ? `${chunks.length} excerpt(s), best ${chunks[0]!.score}` : "no relevant documents",
      };
    }
  );
}

export function createListTablesTool(agent: AgentName) {
  return tracedTool(
    agent,
    {
      name: "list_tables",
      description:
        "Lists the ONLY tables and columns you are allowed to query (authoritative access policy). Call this before writing SQL or drawing a data-model diagram.",
      schema: z.object({}),
    },
    async () => ({ output: describePolicy(), detail: "access policy" })
  );
}

export function createSearchSchemaTool(agent: AgentName) {
  return tracedTool(
    agent,
    {
      name: "search_schema",
      description:
        "Semantic search over the database DDL (CREATE TABLE statements, foreign keys, table comments). Use it to understand relations before writing joins.",
      schema: z.object({
        query: z.string().min(2).max(300).describe("What you need to know, e.g. 'which table links users to permissions'"),
      }),
      describeCall: ({ query }) => `“${query}”`,
    },
    async ({ query }) => {
      const chunks = await searchSchema(query);
      return {
        output: formatChunks(chunks),
        detail: chunks.length ? chunks.map((c) => c.source).join(", ") : "nothing relevant",
      };
    }
  );
}
