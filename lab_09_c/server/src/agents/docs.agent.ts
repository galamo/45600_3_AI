/**
 * Docs agent — RAG over the product documentation.
 * Tools: search_docs
 */
import { HumanMessage } from "@langchain/core/messages";
import { getEnv } from "../config/env.js";
import { createSearchDocsTool } from "../tools/knowledge.tools.js";
import { DOCS_AGENT_PROMPT } from "./prompts/index.js";
import { buildAgent, invokeAgent } from "./runtime.js";

let agent: ReturnType<typeof buildAgent> | null = null;

function getAgent() {
  agent ??= buildAgent({
    name: "docs_agent",
    model: getEnv().TESTING_MODEL,
    temperature: 0.1,
    systemPrompt: DOCS_AGENT_PROMPT,
    tools: [createSearchDocsTool("docs_agent")],
    maxModelCalls: 4,
    maxToolCalls: 3,
  });
  return agent;
}

export async function runDocsAgent(task: string): Promise<string> {
  return (await invokeAgent("docs_agent", getAgent(), [new HumanMessage(task)], task)).text;
}
