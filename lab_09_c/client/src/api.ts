/** Client side of the API contract (mirrors server/src/http/schemas.ts). */

export type AgentName = "supervisor" | "docs_agent" | "sql_agent" | "diagram_agent";

export interface TraceEvent {
  id: string;
  at: number;
  kind: "guard" | "agent_start" | "agent_end" | "tool_start" | "tool_end";
  agent: AgentName | "graph";
  name?: string;
  status?: "ok" | "error" | "blocked";
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

export interface Meta {
  models: Record<string, string>;
  mermaidMcp: boolean;
  agents: { name: AgentName; tools: string[] }[];
  limits: { maxQuestionChars: number; maxHistoryTurns: number; sqlMaxRows: number };
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export async function fetchMeta(): Promise<Meta | null> {
  try {
    const res = await fetch("/api/meta");
    return res.ok ? ((await res.json()) as Meta) : null;
  } catch {
    return null;
  }
}

export async function fetchHealth(): Promise<boolean> {
  try {
    return (await fetch("/api/health")).ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/chat/stream and parse Server-Sent Events.
 * `trace` events arrive live while the agents work; one `result` (or `error`) ends the stream.
 */
export async function streamChat(
  message: string,
  history: HistoryTurn[],
  onTrace: (e: TraceEvent) => void,
  signal: AbortSignal
): Promise<ChatResponse> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === "trace") onTrace(payload as TraceEvent);
      else if (event === "result") return payload as ChatResponse;
      else if (event === "error") throw new Error((payload as { message: string }).message);
    }
  }
  throw new Error("The connection closed before an answer arrived.");
}
