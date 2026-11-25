import type { Meta } from "../api";
import { AGENTS } from "./agents";
import { IconMoon, IconPlus, IconSun, IconX } from "./Icons";

const GUARDRAILS = [
  ["Input guard", "injection · writes · secrets · length"],
  ["SQL guard", "AST parse · 1 SELECT · allow-listed columns"],
  ["DB role", "read-only · column GRANTs · timeout"],
  ["Agent limits", "max model & tool calls per run"],
  ["Output guard", "redacts secrets · caps size"],
];

interface Props {
  meta: Meta | null;
  healthy: boolean | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onNewChat: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ meta, healthy, theme, onToggleTheme, onNewChat, open, onClose }: Props) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <span className="logo" aria-hidden>✓</span>
        <div>
          <strong>SSO Copilot</strong>
          <span className="muted small">Lab 09 c</span>
        </div>
        <button className="icon-btn only-mobile" onClick={onClose} aria-label="Close menu"><IconX /></button>
      </div>

      <button className="new-chat" onClick={onNewChat}><IconPlus /> New chat</button>

      <section className="side-section">
        <h3>Agents & tools</h3>
        {(meta?.agents ?? []).map((a) => (
          <div key={a.name} className="side-agent" style={{ ["--agent" as string]: AGENTS[a.name].color }}>
            <div className="side-agent-head">
              <span className="dot" />
              <span>{AGENTS[a.name].label}</span>
              <span className="muted tiny">{meta?.models[a.name === "docs_agent" ? "docs" : a.name === "sql_agent" ? "sql" : a.name === "diagram_agent" ? "diagram" : "supervisor"]?.replace(/^.*\//, "")}</span>
            </div>
            <div className="tool-chips">
              {a.tools.map((t) => <code key={t}>{t}</code>)}
            </div>
          </div>
        ))}
        {!meta && <p className="muted small">Server not reachable.</p>}
      </section>

      <section className="side-section">
        <h3>Guardrails</h3>
        <ul className="guard-list">
          {GUARDRAILS.map(([name, desc]) => (
            <li key={name}><strong>{name}</strong><span>{desc}</span></li>
          ))}
        </ul>
      </section>

      <footer className="side-foot">
        <span className={`status ${healthy ? "up" : healthy === false ? "down" : ""}`}>
          <span className="dot" /> {healthy ? "API & database online" : healthy === false ? "API or database offline" : "Checking…"}
        </span>
        <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </footer>
    </aside>
  );
}
