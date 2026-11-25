/**
 * Output guardrail — last deterministic pass over everything leaving the server.
 *  - masks secrets / hashes that might have leaked into model text
 *  - strips sensitive keys from SQL rows (belt-and-braces; the DB role can't read them anyway)
 *  - caps sizes so a runaway answer can't flood the client
 */
import { DENIED_COLUMNS } from "../db/access-policy.js";
import { maskSecrets } from "../lib/logger.js";

const HASH_PATTERNS: RegExp[] = [
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, // bcrypt
  /\$argon2(id|i|d)\$[^\s"']+/g, // argon2
];

const MAX_ANSWER_CHARS = 12_000;

export function sanitizeText(text: string): string {
  const masked = HASH_PATTERNS.reduce((acc, re) => acc.replace(re, "[REDACTED]"), maskSecrets(text));
  return masked.length > MAX_ANSWER_CHARS ? masked.slice(0, MAX_ANSWER_CHARS) + "\n\n…(truncated)" : masked;
}

export function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DENIED_COLUMNS.has(k.toLowerCase())) continue;
    out[k] = typeof v === "string" ? sanitizeText(v) : v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
