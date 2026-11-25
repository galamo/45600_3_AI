import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { IconSend, IconStop } from "./Icons";

interface Props {
  busy: boolean;
  maxChars: number;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ busy, maxChars, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const over = text.length > maxChars;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || over || !text.trim()) return;
    onSend(text);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder="Ask about users, permissions, logins, bookings — or ask for a diagram…"
        aria-label="Message"
        autoFocus
      />
      <div className="composer-bar">
        <span className={`counter ${over ? "over" : ""}`}>{text.length > maxChars * 0.7 ? `${text.length}/${maxChars}` : "Enter to send · Shift+Enter for a new line"}</span>
        {busy ? (
          <button type="button" className="send stop" onClick={onStop} aria-label="Stop">
            <IconStop /> Stop
          </button>
        ) : (
          <button type="submit" className="send" disabled={!text.trim() || over} aria-label="Send">
            Send <IconSend />
          </button>
        )}
      </div>
    </form>
  );
}
