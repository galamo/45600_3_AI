/**
 * Agent runtime — the one place agents are built and invoked.
 *
 * Every agent is a LangChain v1 `createAgent` (a LangGraph ReAct loop under the hood) with the
 * same production middleware stack:
 *   • modelCallLimitMiddleware — caps LLM calls per run (cost + runaway-loop protection)
 *   • toolCallLimitMiddleware  — caps tool calls per run
 *   • modelRetryMiddleware     — retries transient provider errors with backoff
 */
import {
  createAgent,
  modelCallLimitMiddleware,
  modelRetryMiddleware,
  toolCallLimitMiddleware,
  toolStrategy,
} from "langchain";
import type { z } from "zod";
import type { BaseMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createChatModel } from "../lib/llm.js";
import { currentContext, markAgentUsed, recordEvent } from "../lib/request-context.js";
import type { AgentName } from "../types.js";

export interface AgentSpec {
  name: AgentName;
  model: string;
  temperature?: number;
  systemPrompt: string;
  tools: DynamicStructuredTool[];
  /** max LLM calls in one run */
  maxModelCalls: number;
  /** max tool calls in one run */
  maxToolCalls: number;
  /** Optional Zod schema → the agent must finish with a validated structured response. */
  responseFormat?: z.ZodObject;
}

export function buildAgent(spec: AgentSpec) {
  return createAgent({
    name: spec.name,
    model: createChatModel(spec.model, spec.temperature ?? 0),
    tools: spec.tools,
    systemPrompt: spec.systemPrompt,
    // toolStrategy works with any tool-calling model: the final answer is a schema-validated tool call.
    ...(spec.responseFormat ? { responseFormat: toolStrategy(spec.responseFormat) } : {}),
    middleware: [
      modelCallLimitMiddleware({ runLimit: spec.maxModelCalls, exitBehavior: "end" }),
      toolCallLimitMiddleware({ runLimit: spec.maxToolCalls, exitBehavior: "continue" }),
      modelRetryMiddleware({ maxRetries: 2 }),
    ],
  });
}

type BuiltAgent = ReturnType<typeof buildAgent>;

/** Text of the last AI message (content may be a string or an array of content blocks). */
export function finalText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.getType() !== "ai") continue;
    const text = typeof m.content === "string"
      ? m.content
      : m.content.map((b) => (typeof b === "string" ? b : b.type === "text" ? String((b as { text?: string }).text ?? "") : "")).join("");
    if (text.trim()) return text.trim();
  }
  return "";
}

export interface AgentRun {
  text: string;
  /** Present when the agent was built with a responseFormat. */
  structured?: unknown;
}

/** Invokes an agent with tracing, cancellation (client disconnect / timeout) and a recursion cap. */
export async function invokeAgent(name: AgentName, agent: BuiltAgent, messages: BaseMessage[], detail?: string): Promise<AgentRun> {
  const ctx = currentContext();
  const started = Date.now();
  markAgentUsed(name);
  recordEvent({ kind: "agent_start", agent: name, detail });
  try {
    const result = await agent.invoke({ messages }, { recursionLimit: 30, signal: ctx?.signal });
    const text = finalText(result.messages as BaseMessage[]);
    recordEvent({ kind: "agent_end", agent: name, status: "ok", durationMs: Date.now() - started });
    return { text, structured: (result as { structuredResponse?: unknown }).structuredResponse };
  } catch (err) {
    recordEvent({
      kind: "agent_end",
      agent: name,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 160) : String(err),
      durationMs: Date.now() - started,
    });
    throw err;
  }
}
