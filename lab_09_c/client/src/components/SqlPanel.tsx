import { useState } from "react";
import type { SqlArtifact } from "../api";
import { IconCheck, IconCopy, IconShield } from "./Icons";
import { ResultsTable } from "./ResultsTable";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-btn"
      title="Copy SQL"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

export function SqlPanel({ queries }: { queries: SqlArtifact[] }) {
  return (
    <div className="sql-list">
      {queries.map((q, i) => {
        const rejected = q.error?.startsWith("Rejected by SQL guard");
        const state = q.error ? (rejected ? "rejected" : "failed") : "ok";
        return (
          <section key={i} className={`sql-card ${state}`}>
            <header>
              <span className="eyebrow">Query {i + 1}</span>
              {state === "ok" && <span className="pill ok">{q.rowCount} row{q.rowCount === 1 ? "" : "s"}</span>}
              {state === "rejected" && <span className="pill warn"><IconShield width={12} height={12} /> blocked by SQL guard</span>}
              {state === "failed" && <span className="pill err">database error</span>}
              <CopyButton text={q.query} />
            </header>
            <pre className="code sql"><code>{q.query}</code></pre>
            {q.error ? (
              <p className={`sql-error ${state}`}>
                {q.error.replace(/^Rejected by SQL guard: /, "")}
                {i < queries.length - 1 && <span className="muted"> — the agent read this and corrected its query ↓</span>}
              </p>
            ) : (
              <ResultsTable columns={q.columns} rows={q.rows} truncated={q.truncated} />
            )}
          </section>
        );
      })}
    </div>
  );
}
