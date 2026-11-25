/**
 * Chunking helpers used by the indexing scripts (pure functions → unit-tested).
 */
import { DENIED_COLUMNS } from "../db/access-policy.js";

export interface Chunk {
  content: string;
  metadata: Record<string, unknown>;
}

const decodeEntities = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits an HTML page by <h2> sections so each chunk is one self-contained topic. */
export function chunkHtml(html: string, source: string, maxChars = 1200): Chunk[] {
  const title = htmlToText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? source);
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "");
  const sections = body.split(/(?=<h2\b)/i);
  const chunks: Chunk[] = [];
  for (const section of sections) {
    const heading = htmlToText(section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "");
    const text = htmlToText(section);
    if (text.length < 20) continue;
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push({ content: `${title} — ${text.slice(i, i + maxChars)}`, metadata: { source, heading } });
    }
  }
  return chunks;
}

/** One chunk per table (DDL + comment), with restricted columns removed. */
export function chunkSchema(sql: string, source = "schema.sql"): Chunk[] {
  const comments = new Map<string, string>();
  for (const m of sql.matchAll(/COMMENT ON TABLE (\w+) IS '([^']+)';/g)) comments.set(m[1]!, m[2]!);

  const chunks: Chunk[] = [];
  for (const m of sql.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const table = m[1]!;
    const lines = m[2]!
      .split("\n")
      .filter((l) => l.trim() && !DENIED_COLUMNS.has(l.trim().split(/\s+/)[0]!.toLowerCase()))
      .map((l) => l.replace(/,\s*$/, ""));
    const relations = [...m[2]!.matchAll(/(\w+)\s+\w+[^,\n]*REFERENCES (\w+)\((\w+)\)/g)].map((r) => `${table}.${r[1]} → ${r[2]}.${r[3]}`);
    const content = [
      `Table ${table}: ${comments.get(table) ?? ""}`.trim(),
      `Columns:\n${lines.map((l) => "  " + l.trim()).join("\n")}`,
      relations.length ? `Relations: ${relations.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    chunks.push({ content, metadata: { source, table } });
  }
  return chunks;
}
