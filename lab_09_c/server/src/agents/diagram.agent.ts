/**
 * Diagram agent — produces Mermaid diagrams.
 * Tools: list_tables · search_docs · (optional) Mermaid MCP tools
 *
 * Output is STRUCTURED (Zod via createAgent's responseFormat), not free text parsed with regex:
 * { summary, diagramType, mermaid }. The Mermaid code goes into the request artifacts so the
 * UI renders it even if the supervisor paraphrases the summary.
 */
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { currentContext } from "../lib/request-context.js";
import { getMermaidMcpTools } from "../services/mermaid-mcp.service.js";
import { createListTablesTool, createSearchDocsTool } from "../tools/knowledge.tools.js";
import { traceExistingTool } from "../tools/traced-tool.js";
import { DIAGRAM_AGENT_PROMPT } from "./prompts/index.js";
import { buildAgent, invokeAgent } from "./runtime.js";

export const DiagramSchema = z.object({
  summary: z.string().max(300).describe("One sentence describing the diagram"),
  diagramType: z.enum(["flowchart", "sequenceDiagram", "erDiagram", "classDiagram", "stateDiagram"]),
  mermaid: z
    .string()
    .min(10)
    .max(6000)
    .describe("Raw Mermaid source only — no ``` fences, no %%{init}%% directives, no click/href"),
});
export type Diagram = z.infer<typeof DiagramSchema>;

let agent: ReturnType<typeof buildAgent> | null = null;
let builtWithMcp = false;

async function getAgent() {
  const mcpTools = await getMermaidMcpTools();
  // Rebuild once if MCP became available after a failed first attempt.
  if (!agent || (!builtWithMcp && mcpTools.length > 0)) {
    builtWithMcp = mcpTools.length > 0;
    agent = buildAgent({
      name: "diagram_agent",
      model: getEnv().TESTING_MODEL,
      temperature: 0.2,
      systemPrompt: DIAGRAM_AGENT_PROMPT,
      tools: [
        createListTablesTool("diagram_agent"),
        createSearchDocsTool("diagram_agent"),
        ...mcpTools.map((t) => traceExistingTool("diagram_agent", t)),
      ],
      responseFormat: DiagramSchema,
      maxModelCalls: 6,
      maxToolCalls: 5,
    });
  }
  return agent;
}

/** Strips anything that could make the client-side renderer do more than draw boxes. */
export function sanitizeMermaid(src: string): string {
  return src
    .replace(/^```(?:mermaid)?\s*|```\s*$/g, "")
    .split("\n")
    .filter((line) => !/^\s*(%%\{|click\s|.*\bhref\b|.*javascript:)/i.test(line))
    .join("\n")
    .trim();
}

export async function runDiagramAgent(task: string): Promise<string> {
  const run = await invokeAgent("diagram_agent", await getAgent(), [new HumanMessage(task)], task);
  const parsed = DiagramSchema.safeParse(run.structured);
  if (!parsed.success) return run.text || "The diagram agent could not produce a valid diagram.";

  const mermaid = sanitizeMermaid(parsed.data.mermaid);
  currentContext()?.artifacts.diagrams.push(mermaid);
  return `${parsed.data.summary}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``;
}
