import { useCallback, useRef, useState } from "react";
import { streamChat, type ChatResponse, type HistoryTurn, type TraceEvent } from "../api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "done" | "error" | "stopped";
  trace: TraceEvent[];
  response?: ChatResponse;
  error?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Strip big Mermaid blocks from history — the model doesn't need them to resolve follow-ups. */
const compact = (text: string) => text.replace(/```mermaid[\s\S]*?```/g, "[diagram]").slice(0, 1500);

export function useChat(maxHistoryTurns = 6) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;

      const history: HistoryTurn[] = messages
        .filter((m) => m.status === "done" && !m.response?.blocked)
        .slice(-maxHistoryTurns * 2)
        .map((m) => ({ role: m.role, content: compact(m.content) }));

      const userMsg: ChatMessage = { id: uid(), role: "user", content: message, status: "done", trace: [] };
      const botId = uid();
      setMessages((prev) => [...prev, userMsg, { id: botId, role: "assistant", content: "", status: "pending", trace: [] }]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await streamChat(
          message,
          history,
          (e) => patch(botId, (m) => ({ ...m, trace: [...m.trace, e] })),
          controller.signal
        );
        patch(botId, (m) => ({ ...m, content: res.answer, status: "done", response: res, trace: res.trace }));
      } catch (err) {
        if (controller.signal.aborted) {
          patch(botId, (m) => ({ ...m, status: "stopped", content: "Stopped." }));
        } else {
          patch(botId, (m) => ({ ...m, status: "error", error: err instanceof Error ? err.message : String(err) }));
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, messages, maxHistoryTurns]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, reset };
}
