/**
 * Renders Mermaid source to SVG. Mermaid is lazy-loaded (it's large) and runs with
 * securityLevel "strict" (no click handlers, HTML labels sanitised).
 */
import { useEffect, useId, useState } from "react";

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
const loadMermaid = () => (mermaidPromise ??= import("mermaid").then((m) => m.default));

const isDark = () =>
  document.documentElement.dataset.theme === "dark" ||
  (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"diagram" | "code">("diagram");

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "neutral", fontFamily: "Inter, sans-serif" });
        const { svg } = await mermaid.render(`m${id}${Date.now()}`, code);
        if (!cancelled) setSvg(svg);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return (
    <figure className="diagram">
      <div className="diagram-bar">
        <span className="eyebrow">Mermaid diagram</span>
        <div className="seg">
          <button className={view === "diagram" ? "on" : ""} onClick={() => setView("diagram")}>Diagram</button>
          <button className={view === "code" ? "on" : ""} onClick={() => setView("code")}>Code</button>
        </div>
      </div>
      {view === "code" || error ? (
        <>
          {error && <p className="diagram-error">Could not render: {error.split("\n")[0]}</p>}
          <pre className="code"><code>{code}</code></pre>
        </>
      ) : svg ? (
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="diagram-loading">Rendering…</div>
      )}
    </figure>
  );
}
