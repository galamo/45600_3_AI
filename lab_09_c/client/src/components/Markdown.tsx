/**
 * Markdown for assistant answers. react-markdown does NOT render raw HTML by default,
 * so model output can't inject markup/scripts. ```mermaid blocks become live diagrams.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./Mermaid";

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            const content = String(children).replace(/\n$/, "");
            if (lang === "mermaid") return <Mermaid code={content} />;
            if (lang) return <pre className="code"><code>{content}</code></pre>;
            return <code className="inline">{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
