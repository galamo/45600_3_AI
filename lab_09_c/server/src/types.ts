/** Shared domain types (server ↔ client contract lives in http/schemas.ts). */

export type AgentName = "supervisor" | "docs_agent" | "sql_agent" | "diagram_agent";

export type TraceKind =
  | "guard" // deterministic guardrail decision
  | "agent_start"
  | "agent_end"
  | "tool_start"
  | "tool_end";

export interface TraceEvent {
  id: string;
  /** ms since request start */
  at: number;
  kind: TraceKind;
  agent: AgentName | "graph";
  /** tool or guard name */
  name?: string;
  status?: "ok" | "error" | "blocked";
  /** short, human readable — never raw secrets or full row dumps */
  detail?: string;
  durationMs?: number;
}

export interface SqlArtifact {
  query: string;
  rowCount: number | null;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  error: string | null;
}

export interface SourceArtifact {
  source: string;
  score: number;
  excerpt: string;
}

export interface Artifacts {
  sql: SqlArtifact[];
  diagrams: string[];
  sources: SourceArtifact[];
  agents: AgentName[];
}

export interface GuardVerdict {
  allowed: boolean;
  category?: "too_long" | "empty" | "prompt_injection" | "data_modification" | "sensitive_data";
  reason?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
