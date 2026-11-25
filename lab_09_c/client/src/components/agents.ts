import type { AgentName } from "../api";

/** Display metadata per agent — one colour per agent is used consistently across the UI. */
export const AGENTS: Record<AgentName | "graph", { label: string; short: string; color: string }> = {
  supervisor: { label: "Supervisor", short: "router", color: "var(--c-supervisor)" },
  docs_agent: { label: "Docs agent", short: "RAG", color: "var(--c-docs)" },
  sql_agent: { label: "SQL agent", short: "read-only", color: "var(--c-sql)" },
  diagram_agent: { label: "Diagram agent", short: "Mermaid", color: "var(--c-diagram)" },
  graph: { label: "Guardrail", short: "graph", color: "var(--c-guard)" },
};

export const formatMs = (ms?: number) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
