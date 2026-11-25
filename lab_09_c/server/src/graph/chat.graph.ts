/**
 * Chat graph (LangGraph) — the deterministic shell around the non-deterministic agents.
 *
 *   START → guardInput ──blocked──▶ refuse ─────────────┐
 *                      └─allowed──▶ supervisor → guardOutput → END
 *
 * Why a graph and not just one agent call?
 *   • guardrails are explicit, testable nodes that ALWAYS run (the LLM can't skip them)
 *   • blocked requests never reach a model (cost, latency, safety)
 *   • each node does one job and passes typed state to the next
 */
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { runSupervisor } from "../agents/supervisor.agent.js";
import { getEnv } from "../config/env.js";
import { checkInput, normalizeInput } from "../guardrails/input-guard.js";
import { sanitizeText } from "../guardrails/output-guard.js";
import { currentContext, recordEvent } from "../lib/request-context.js";
import type { ChatTurn, GuardVerdict } from "../types.js";

const ChatState = Annotation.Root({
  question: Annotation<string>(),
  history: Annotation<ChatTurn[]>(),
  verdict: Annotation<GuardVerdict | undefined>(),
  answer: Annotation<string>(),
});
type State = typeof ChatState.State;

const HISTORY_MESSAGE_CHARS = 1500;

function guardInputNode(state: State): Partial<State> {
  const question = normalizeInput(state.question);
  const verdict = checkInput(question, getEnv().MAX_QUESTION_CHARS);
  recordEvent({
    kind: "guard",
    agent: "graph",
    name: "input_guard",
    status: verdict.allowed ? "ok" : "blocked",
    detail: verdict.allowed ? "passed" : verdict.category,
  });
  return { question, verdict };
}

function refuseNode(state: State): Partial<State> {
  return { answer: state.verdict?.reason ?? "I can't help with that request." };
}

async function supervisorNode(state: State): Promise<Partial<State>> {
  // History comes from the client (stateless server). It is trimmed, length-capped and
  // re-normalised; it can only add context — every tool still enforces its own rules.
  const turns = state.history.slice(-getEnv().MAX_HISTORY_TURNS * 2);
  const messages: BaseMessage[] = turns.map((t) => {
    const content = normalizeInput(t.content).slice(0, HISTORY_MESSAGE_CHARS);
    return t.role === "user" ? new HumanMessage(content) : new AIMessage(content);
  });
  messages.push(new HumanMessage(state.question));
  return { answer: await runSupervisor(messages) };
}

function guardOutputNode(state: State): Partial<State> {
  let answer = sanitizeText(state.answer || "Sorry — I couldn't produce an answer. Please rephrase and try again.");
  // If the supervisor paraphrased away the diagram, re-attach it from the artifacts.
  const diagrams = currentContext()?.artifacts.diagrams ?? [];
  if (diagrams.length && !answer.includes("```mermaid")) {
    answer += `\n\n\`\`\`mermaid\n${diagrams[diagrams.length - 1]}\n\`\`\``;
  }
  recordEvent({ kind: "guard", agent: "graph", name: "output_guard", status: "ok", detail: "sanitized" });
  return { answer };
}

export function buildChatGraph() {
  return new StateGraph(ChatState)
    .addNode("guardInput", guardInputNode)
    .addNode("refuse", refuseNode)
    .addNode("supervisor", supervisorNode)
    .addNode("guardOutput", guardOutputNode)
    .addEdge(START, "guardInput")
    .addConditionalEdges("guardInput", (s: State) => (s.verdict?.allowed ? "supervisor" : "refuse"), ["supervisor", "refuse"])
    .addEdge("refuse", END)
    .addEdge("supervisor", "guardOutput")
    .addEdge("guardOutput", END)
    .compile();
}

let graph: ReturnType<typeof buildChatGraph> | null = null;

export async function runChat(question: string, history: ChatTurn[]): Promise<{ answer: string; verdict: GuardVerdict }> {
  graph ??= buildChatGraph();
  const result = await graph.invoke(
    { question, history, answer: "" },
    { signal: currentContext()?.signal }
  );
  return { answer: result.answer, verdict: result.verdict ?? { allowed: true } };
}

export const GRAPH_DESCRIPTION = {
  nodes: ["guardInput", "refuse", "supervisor", "guardOutput"],
  edges: ["START→guardInput", "guardInput→refuse (blocked)", "guardInput→supervisor (allowed)", "supervisor→guardOutput", "refuse→END", "guardOutput→END"],
};
