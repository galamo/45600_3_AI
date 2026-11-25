/**
 * Supervisor agent — the router. Each specialist agent is exposed to it as a TOOL
 * ("agents as tools"), so routing is a model decision, not if/else in application code.
 * Tools: ask_docs_agent · ask_sql_agent · ask_diagram_agent
 */
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { tracedTool } from "../tools/traced-tool.js";
import { runDiagramAgent } from "./diagram.agent.js";
import { runDocsAgent } from "./docs.agent.js";
import { SUPERVISOR_PROMPT } from "./prompts/index.js";
import { buildAgent, invokeAgent } from "./runtime.js";
import { runSqlAgent } from "./sql.agent.js";

const taskSchema = z.object({
  task: z
    .string()
    .min(3)
    .max(800)
    .describe("A complete, self-contained instruction for the specialist (resolve follow-ups and pronouns)."),
});

function specialistTool(name: string, description: string, run: (task: string) => Promise<string>) {
  return tracedTool(
    "supervisor",
    { name, description, schema: taskSchema, describeCall: ({ task }) => task },
    async ({ task }) => {
      const answer = await run(task);
      return { output: answer || "The specialist returned no answer.", detail: `${answer.length} chars` };
    }
  );
}

let agent: ReturnType<typeof buildAgent> | null = null;

function getAgent() {
  agent ??= buildAgent({
    name: "supervisor",
    model: getEnv().TESTING_MODEL,
    temperature: 0,
    systemPrompt: SUPERVISOR_PROMPT,
    tools: [
      specialistTool(
        "ask_docs_agent",
        "Ask the documentation specialist. Use for: what is SSO, how login works, project guidelines, definitions, FAQ.",
        runDocsAgent
      ),
      specialistTool(
        "ask_sql_agent",
        "Ask the database specialist (read-only). Use for: counts, lists, filters, who has which permission, login audit, sports resources and bookings.",
        runSqlAgent
      ),
      specialistTool(
        "ask_diagram_agent",
        "Ask the diagram specialist for a Mermaid diagram: flowchart, sequence diagram, or ER diagram of the data model.",
        runDiagramAgent
      ),
    ],
    maxModelCalls: 5,
    maxToolCalls: 3,
  });
  return agent;
}

export async function runSupervisor(messages: BaseMessage[]): Promise<string> {
  return (await invokeAgent("supervisor", getAgent(), messages)).text;
}
