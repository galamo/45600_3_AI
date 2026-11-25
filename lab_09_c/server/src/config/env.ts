/**
 * Environment configuration — validated once at startup with zod.
 * The server refuses to boot with a clear message instead of failing later mid-request.
 *
 * Key names match the other labs' .env files (OPENROUTER_API_KEY, PG_*, MCP_MERMAID_AUTH,
 * SQL_BASED_MODEL, TESTING_MODEL), so an existing .env works as-is.
 */
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ quiet: true });

const csv = z
  .string()
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3012),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGINS: csv.default(["http://localhost:5185"]),

  // ── LLM (OpenRouter) ───────────────────────────────────────────────
  OPENROUTER_API_KEY: z.string().min(1, "Set OPENROUTER_API_KEY in .env"),
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  /** Supervisor, docs and diagram agents. */
  TESTING_MODEL: z.string().default("openai/gpt-4o-mini"),
  /** SQL agent (benefits from a stronger model). */
  SQL_BASED_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(2048),

  // ── Postgres: owner account (setup scripts + vector stores) ──────────
  PG_HOST: z.string().default("localhost"),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_USER: z.string().default("admin"),
  PG_PASSWORD: z.string().default("admin123"),
  PG_DATABASE: z.string().default("vectordb"),

  // ── Postgres: least-privilege account used ONLY by the SQL tool ──────
  AGENT_DB_USER: z.string().regex(/^[a-z_][a-z0-9_]*$/).default("agent_reader"),
  AGENT_DB_PASSWORD: z.string().min(8).default("agent_reader_pw"),

  // ── Mermaid MCP (optional — diagrams still work without it) ─────────
  MCP_MERMAID_URL: z.url().default("https://mcp.mermaid.ai/mcp"),
  MCP_MERMAID_AUTH: z.string().optional(),

  // ── Guardrail limits ────────────────────────────────────────────────
  MAX_QUESTION_CHARS: z.coerce.number().int().positive().default(1000),
  MAX_HISTORY_TURNS: z.coerce.number().int().nonnegative().default(6),
  SQL_MAX_ROWS: z.coerce.number().int().positive().default(200),
  SQL_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration (server/.env):\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** MCP header values may be stored with surrounding quotes in .env — normalise them. */
export function mermaidAuthHeader(): string | null {
  const raw = getEnv().MCP_MERMAID_AUTH?.trim().replace(/^"(.*)"$/, "$1");
  // Treat an untouched .env.example placeholder ("<…>") as "not configured".
  return raw && !raw.startsWith("<") ? raw : null;
}
