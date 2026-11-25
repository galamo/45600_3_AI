/**
 * SQL agent — answers questions from the live database.
 * Tools: list_tables · search_schema · run_readonly_sql
 *
 * Unlike a fixed "generate → execute → answer" pipeline, the agent loop lets the model read a
 * database error (e.g. permission denied on a column) and correct its own query.
 */
import { HumanMessage } from "@langchain/core/messages";
import { getEnv } from "../config/env.js";
import { createListTablesTool, createSearchSchemaTool } from "../tools/knowledge.tools.js";
import { createRunSqlTool } from "../tools/sql.tools.js";
import { SQL_AGENT_PROMPT } from "./prompts/index.js";
import { buildAgent, invokeAgent } from "./runtime.js";

let agent: ReturnType<typeof buildAgent> | null = null;

function getAgent() {
  agent ??= buildAgent({
    name: "sql_agent",
    model: getEnv().SQL_BASED_MODEL,
    systemPrompt: SQL_AGENT_PROMPT,
    tools: [createListTablesTool("sql_agent"), createSearchSchemaTool("sql_agent"), createRunSqlTool()],
    maxModelCalls: 8,
    maxToolCalls: 7,
  });
  return agent;
}

export async function runSqlAgent(task: string): Promise<string> {
  return (await invokeAgent("sql_agent", getAgent(), [new HumanMessage(task)], task)).text;
}
