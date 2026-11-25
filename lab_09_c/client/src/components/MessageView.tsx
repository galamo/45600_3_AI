import { useState } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { AGENTS, formatMs } from "./agents";
import { IconBook, IconDb, IconGraph, IconShield } from "./Icons";
import { Markdown } from "./Markdown";
import { SqlPanel } from "./SqlPanel";
import { TraceTimeline } from "./TraceTimeline";

type Tab = "steps" | "sql" | "sources";

const CATEGORY_LABEL: Record<string, string> = {
  prompt_injection: "Prompt-injection attempt",
  data_modification: "Write request on a read-only system",
  sensitive_data: "Restricted data",
  too_long: "Message too long",
  empty: "Empty message",
};

export function MessageView({ message }: { message: ChatMessage }) {
  const [tab, setTab] = useState<Tab | null>(null);

  if (message.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{message.content}</div>
      </div>
    );
  }

  const res = message.response;
  const pending = message.status === "pending";
  const sqlCount = res?.sql.length ?? 0;
  const sourceCount = res?.sources.length ?? 0;
  const stepCount = message.trace.filter((e) => e.kind === "tool_start" || e.kind === "guard").length;
  const activeTab: Tab | null = pending ? "steps" : tab;
  const toggle = (t: Tab) => setTab((cur) => (cur === t ? null : t));

  return (
    <div className="msg assistant">
      <div className="avatar" aria-hidden>AI</div>
      <div className="card">
        {res && !res.blocked && res.agents.length > 0 && (
          <div className="agent-row">
            {res.agents.filter((a) => a !== "supervisor").map((a) => (
              <span key={a} className="agent-chip" style={{ ["--agent" as string]: AGENTS[a].color }}>
                {a === "sql_agent" ? <IconDb width={13} height={13} /> : a === "docs_agent" ? <IconBook width={13} height={13} /> : <IconGraph width={13} height={13} />}
                {AGENTS[a].label}
              </span>
            ))}
            <span className="muted small push">{formatMs(res.durationMs)}</span>
          </div>
        )}

        {pending && (
          <div className="thinking">
            <span className="dots"><i /><i /><i /></span>
            <span>Working on it…</span>
          </div>
        )}

        {res?.blocked ? (
          <div className="guard-notice">
            <IconShield width={18} height={18} />
            <div>
              <strong>{CATEGORY_LABEL[res.blocked.category] ?? "Blocked by guardrail"}</strong>
              <p>{res.blocked.reason}</p>
              <span className="muted small">Stopped by the input guardrail before any model was called.</span>
            </div>
          </div>
        ) : message.status === "error" ? (
          <div className="error-notice">{message.error}</div>
        ) : message.content ? (
          <Markdown text={message.content} />
        ) : null}

        {(stepCount > 0 || sqlCount > 0 || sourceCount > 0) && (
          <div className="workbench">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={activeTab === "steps"} className={activeTab === "steps" ? "on" : ""} onClick={() => toggle("steps")}>
                Agent steps <span className="count">{stepCount}</span>
              </button>
              {sqlCount > 0 && (
                <button role="tab" aria-selected={activeTab === "sql"} className={activeTab === "sql" ? "on" : ""} onClick={() => toggle("sql")}>
                  SQL <span className="count">{sqlCount}</span>
                </button>
              )}
              {sourceCount > 0 && (
                <button role="tab" aria-selected={activeTab === "sources"} className={activeTab === "sources" ? "on" : ""} onClick={() => toggle("sources")}>
                  Sources <span className="count">{sourceCount}</span>
                </button>
              )}
            </div>
            {activeTab === "steps" && <TraceTimeline events={message.trace} done={!pending} />}
            {activeTab === "sql" && res && <SqlPanel queries={res.sql} />}
            {activeTab === "sources" && res && (
              <ul className="sources">
                {res.sources.map((s, i) => (
                  <li key={i}>
                    <div className="src-head"><span className="mono">{s.source}</span><span className="pill tiny">similarity {s.score.toFixed(2)}</span></div>
                    <p>{s.excerpt}…</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
