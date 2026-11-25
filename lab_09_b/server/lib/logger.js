/**
 * Flow logger: high-level, readable console logs for every step of a request.
 *
 *   ==============================  request banner (one per /query)
 *   ----- ▶ Agent -----             agent / pipeline entered
 *     → step   ✔ done   ✖ error     steps inside an agent
 *     📚 chunks                      retrieval results (count + preview)
 *     🤖 llm                         model call (model, ms, tokens)
 *     🔧 tool                        tool call (args, result size)
 *
 * Each line carries the request id and the elapsed time since the request started,
 * so logs from concurrent requests can be told apart.
 *
 * Env:
 *   NO_COLOR=1      disable ANSI colors (also off when stdout is not a TTY)
 *   FORCE_COLOR=1   force colors (e.g. inside docker compose)
 *   LOG_CHUNKS=0    hide chunk previews (the count is always shown)
 *   LOG_PREVIEW=120 characters shown per chunk / answer preview
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const useColor = Boolean(process.env.FORCE_COLOR) || (process.stdout.isTTY && !process.env.NO_COLOR);
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const color = {
  bold: paint("1"),
  dim: paint("2"),
  red: paint("31"),
  green: paint("32"),
  yellow: paint("33"),
  blue: paint("34"),
  magenta: paint("35"),
  cyan: paint("36"),
  gray: paint("90"),
};

const WIDTH = 90;
const PREVIEW = Number(process.env.LOG_PREVIEW) || 120;
const SHOW_CHUNKS = process.env.LOG_CHUNKS !== "0";

const requestStore = new AsyncLocalStorage();

/** Run fn inside a request context (id + start time) that all nested logs pick up. */
export function runWithRequestContext(fn) {
  const ctx = { id: randomUUID().slice(0, 8), start: Date.now() };
  return requestStore.run(ctx, () => fn(ctx));
}

function prefix() {
  const ctx = requestStore.getStore();
  if (!ctx) return color.gray(`[${new Date().toISOString().slice(11, 23)}]`);
  return color.gray(`[${ctx.id} +${String(Date.now() - ctx.start).padStart(5)}ms]`);
}

/** One-line, truncated preview of any value. */
export function preview(value, max = PREVIEW) {
  let s = typeof value === "string" ? value : JSON.stringify(value);
  if (s === undefined) s = String(value);
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function rule(char, label = "", paintFn = (s) => s) {
  if (!label) return paintFn(char.repeat(WIDTH));
  const text = ` ${label} `;
  const left = Math.max(3, Math.floor((WIDTH - text.length) / 2));
  const right = Math.max(3, WIDTH - left - text.length);
  return paintFn(char.repeat(left)) + color.bold(text) + paintFn(char.repeat(right));
}

/** Big "=====" banner. lines: extra lines printed inside the banner. */
export function banner(title, lines = [], paintFn = color.cyan) {
  console.log("");
  console.log(rule("=", "", paintFn));
  console.log(rule(" ", title, (s) => s));
  for (const l of lines) console.log("  " + l);
  console.log(rule("=", "", paintFn));
}

/** Text content of a LangChain AIMessage. */
function messageText(response) {
  if (typeof response?.content === "string") return response.content;
  return response?.content?.map?.((c) => (c.type === "text" ? c.text : "")).join("") || "";
}

/**
 * Create a logger for one agent / component.
 * @param {string} scope - e.g. "Router", "HTML RAG Agent"
 * @param {keyof color} [tint]
 */
export function createLogger(scope, tint = "cyan") {
  const tintFn = color[tint] || color.cyan;
  const tag = tintFn(`[${scope}]`);
  const out = (icon, msg) => console.log(`${prefix()} ${tag} ${icon} ${msg}`);
  const detail = (label, value) => console.log(`${prefix()} ${tag}     ${color.gray(label + ":")} ${value}`);

  const log = {
    /** Agent entered: ----- ▶ scope ----- */
    start(input) {
      console.log("");
      console.log(rule("-", `▶ ${scope}`, tintFn));
      if (input !== undefined) detail("input", preview(input));
      return Date.now();
    },
    /** Agent finished: ----- ◀ scope (ms) ----- */
    end(startedAt, summary) {
      if (summary !== undefined) detail("output", preview(summary));
      console.log(rule("-", `◀ ${scope} (${Date.now() - startedAt}ms)`, tintFn));
    },
    step: (msg) => out(color.blue("→"), msg),
    info: (msg) => out(color.gray("•"), msg),
    success: (msg) => out(color.green("✔"), msg),
    warn: (msg) => out(color.yellow("⚠"), color.yellow(msg)),
    error: (msg) => out(color.red("✖"), color.red(msg)),
    detail,

    /** Multi-line block (e.g. SQL), indented. */
    block(label, text) {
      detail(label, "");
      for (const line of String(text).split("\n")) console.log(`${prefix()} ${tag}       ${color.dim(line)}`);
    },

    /** Time an async step: logs "→ label…" then "✔ label (ms)" or "✖ label failed". */
    async time(label, fn) {
      const t0 = Date.now();
      log.step(`${label}…`);
      try {
        const result = await fn();
        log.success(`${label} ${color.gray(`(${Date.now() - t0}ms)`)}`);
        return result;
      } catch (err) {
        log.error(`${label} failed after ${Date.now() - t0}ms: ${err.message || err}`);
        throw err;
      }
    },

    /**
     * Invoke a chat model and log model name, duration, token usage, tool calls and a preview.
     * @param {string} label - what this call is for
     * @param {import("@langchain/core/language_models/chat_models").BaseChatModel} model
     * @param {any[]} messages
     */
    async llm(label, model, messages) {
      const name = model.model || model.modelName || model.bound?.model || "model";
      const t0 = Date.now();
      out("🤖", `LLM ${color.bold(label)} ${color.gray(`[${name}]`)}…`);
      try {
        const response = await model.invoke(messages);
        const u = response.usage_metadata;
        const tokens = u ? ` · tokens in=${u.input_tokens} out=${u.output_tokens}` : "";
        log.success(`LLM ${label} ${color.gray(`(${Date.now() - t0}ms${tokens})`)}`);
        const text = messageText(response);
        if (text) detail("reply", preview(text));
        return response;
      } catch (err) {
        log.error(`LLM ${label} failed after ${Date.now() - t0}ms: ${err.message || err}`);
        throw err;
      }
    },

    /** Tool call about to run. */
    toolCall(name, args) {
      out("🔧", `tool call ${color.bold(name)} ${color.gray(preview(args))}`);
      return Date.now();
    },
    /** Tool call finished. */
    toolResult(name, startedAt, result) {
      log.success(`tool ${name} returned ${color.gray(`(${Date.now() - startedAt}ms)`)} ${color.gray(preview(result))}`);
    },

    /**
     * Log retrieved chunks. Always shows the count; previews unless LOG_CHUNKS=0.
     * @param {string} source - vector table / retriever name
     * @param {number} k - requested top-k
     * @param {[import("@langchain/core/documents").Document, number][]} results - [doc, distance] pairs
     */
    chunks(source, k, results) {
      const n = results.length;
      const countText = color.bold(`${n} chunk${n === 1 ? "" : "s"}`);
      out("📚", `retrieved ${n ? color.green(countText) : color.yellow(countText)} from ${color.bold(source)} ${color.gray(`(k=${k})`)}`);
      if (!SHOW_CHUNKS) return;
      results.forEach(([doc, score], i) => {
        const meta = doc.metadata && Object.keys(doc.metadata).length ? color.magenta(preview(doc.metadata, 60)) : "";
        const dist = typeof score === "number" ? color.yellow(`dist=${score.toFixed(4)}`) : "";
        console.log(`${prefix()} ${tag}     ${color.gray(`#${i + 1}`)} ${dist} ${meta} ${color.dim(preview(doc.pageContent, 80))}`);
      });
    },
  };
  return log;
}
