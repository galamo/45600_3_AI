import { useEffect, useRef, useState } from "react";
import { fetchHealth, fetchMeta, type Meta } from "./api";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { IconMenu } from "./components/Icons";
import { MessageView } from "./components/MessageView";
import { Sidebar } from "./components/Sidebar";
import { useChat } from "./hooks/useChat";

function initialTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem("lab09c-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const { messages, busy, send, stop, reset } = useChat(meta?.limits.maxHistoryTurns);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchMeta().then(setMeta);
    void fetchHealth().then(setHealthy);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("lab09c-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Follow the conversation: jump to the end on every update (after layout), and again shortly
  // after so late-growing content (Mermaid renders async) doesn't leave the view mid-message.
  useEffect(() => {
    const scroll = () => endRef.current?.scrollIntoView({ block: "end" });
    const raf = requestAnimationFrame(scroll);
    const late = setTimeout(scroll, 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, [messages]);

  return (
    <div className="layout">
      <Sidebar
        meta={meta}
        healthy={healthy}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onNewChat={() => { reset(); setMenuOpen(false); }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main className="main">
        <header className="topbar only-mobile">
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu"><IconMenu /></button>
          <strong>SSO Copilot</strong>
        </header>
        <div className="thread" aria-live="polite">
          {messages.length === 0 ? (
            <EmptyState onPick={(text) => void send(text)} />
          ) : (
            messages.map((m) => <MessageView key={m.id} message={m} />)
          )}
          <div ref={endRef} />
        </div>
        <div className="composer-wrap">
          <Composer busy={busy} maxChars={meta?.limits.maxQuestionChars ?? 1000} onSend={(t) => void send(t)} onStop={stop} />
          <p className="fineprint">Read-only access · answers come only from your docs and database · every step is shown.</p>
        </div>
      </main>
    </div>
  );
}
