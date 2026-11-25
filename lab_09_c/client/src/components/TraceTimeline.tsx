/**
 * Turns the raw trace events into readable steps:
 *   🛡 input guard → Supervisor delegates to <agent> → that agent's tool calls → 🛡 output guard
 * Delegations (ask_* tools) are the top level; a specialist's own tool calls are nested under it.
 */
import type { AgentName, TraceEvent } from "../api";
import { AGENTS, formatMs } from "./agents";
import { IconCheck, IconShield, IconTool, IconX } from "./Icons";

interface Step {
  id: string;
  type: "guard" | "delegate" | "tool" | "answer";
  agent: AgentName | "graph";
  name: string;
  callDetail?: string;
  resultDetail?: string;
  status: "running" | "ok" | "error" | "blocked";
  durationMs?: number;
  nested: boolean;
}

const DELEGATE: Record<string, AgentName> = {
  ask_docs_agent: "docs_agent",
  ask_sql_agent: "sql_agent",
  ask_diagram_agent: "diagram_agent",
};

const GUARD_LABEL: Record<string, string> = { input_guard: "Input guardrail", output_guard: "Output guardrail" };

export function buildSteps(events: TraceEvent[], done: boolean): Step[] {
  const steps: Step[] = [];
  const open = new Map<string, Step[]>();
  let depth = 0;
  for (const e of events) {
    if (e.kind === "guard") {
      steps.push({ id: e.id, type: "guard", agent: "graph", name: GUARD_LABEL[e.name ?? ""] ?? e.name ?? "guard", resultDetail: e.detail, status: e.status ?? "ok", nested: false });
    } else if (e.kind === "tool_start") {
      const target = DELEGATE[e.name ?? ""];
      const step: Step = {
        id: e.id,
        type: target ? "delegate" : "tool",
        agent: target ?? e.agent,
        name: target ? AGENTS[target].label : e.name ?? "tool",
        callDetail: e.detail,
        status: "running",
        nested: !target && depth > 0,
      };
      if (target) depth++;
      steps.push(step);
      const key = `${e.agent}:${e.name}`;
      open.set(key, [...(open.get(key) ?? []), step]);
    } else if (e.kind === "tool_end") {
      const key = `${e.agent}:${e.name}`;
      const stack = open.get(key);
      const step = stack?.shift();
      if (step) {
        step.status = e.status === "error" ? "error" : "ok";
        step.resultDetail = e.detail;
        step.durationMs = e.durationMs;
        if (step.type === "delegate") depth = Math.max(0, depth - 1);
      }
    }
  }
  if (done) for (const s of steps) if (s.status === "running") s.status = "ok";
  return steps;
}

export function TraceTimeline({ events, done }: { events: TraceEvent[]; done: boolean }) {
  const steps = buildSteps(events, done);
  if (!steps.length) return <p className="muted small">Starting…</p>;
  return (
    <ol className="timeline">
      {steps.map((s) => {
        const meta = AGENTS[s.agent];
        return (
          <li key={s.id} className={`step ${s.type} ${s.status} ${s.nested ? "nested" : ""}`} style={{ ["--agent" as string]: meta.color }}>
            <span className="step-dot">
              {s.status === "running" ? <span className="spinner" />
                : s.status === "blocked" || s.status === "error" ? <IconX width={12} height={12} />
                : s.type === "guard" ? <IconShield width={12} height={12} />
                : s.type === "tool" ? <IconTool width={12} height={12} />
                : <IconCheck width={12} height={12} />}
            </span>
            <div className="step-body">
              <div className="step-head">
                {s.type === "delegate" && <span className="muted">Supervisor → </span>}
                <span className={s.type === "tool" ? "mono step-name" : "step-name"}>{s.name}</span>
                {s.type === "tool" && <span className="pill tiny" style={{ color: meta.color }}>{meta.label}</span>}
                <span className="step-time">{formatMs(s.durationMs)}</span>
              </div>
              {s.callDetail && <div className="step-detail">{s.callDetail}</div>}
              {s.resultDetail && s.type !== "delegate" && (
                <div className={`step-result ${s.status}`}>{s.status === "blocked" ? `blocked · ${s.resultDetail}` : s.resultDetail}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
