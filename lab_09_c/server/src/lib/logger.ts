/**
 * Minimal structured (JSON-lines) logger.
 * - every line carries the requestId of the current request (via request context)
 * - known secret-looking values are masked before anything is written
 */
import { currentContext } from "./request-context.js";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_PATTERNS: RegExp[] = [
  /sk-or-v1-[a-z0-9]{8,}/gi, // OpenRouter keys
  /sk-[a-z0-9]{20,}/gi, // OpenAI-style keys
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/g,
];

export function maskSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, "[REDACTED]"), text);
}

let minLevel: Level = (process.env.LOG_LEVEL as Level) ?? "info";
export function setLogLevel(level: Level): void {
  minLevel = level;
}

function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const ctx = currentContext();
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(ctx ? { requestId: ctx.requestId } : {}),
    ...fields,
  });
  const safe = maskSecrets(line);
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(safe + "\n");
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.message, name: err.name, stack: err.stack?.split("\n").slice(0, 4).join(" | ") };
  return { error: String(err) };
}
