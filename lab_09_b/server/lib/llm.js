/**
 * Shared ChatOpenAI factory for OpenRouter / OpenAI.
 * Caps maxTokens so OpenRouter does not reserve the model default (e.g. 65536).
 */
import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 4096;

/**
 * @param {{ model?: string, temperature?: number, maxTokens?: number }} [opts]
 */
export function createChatModel(opts = {}) {
  const {
    model = process.env.TESTING_MODEL || "openai/gpt-4o-mini",
    temperature = 0,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = opts;

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openRouterKey) {
    return new ChatOpenAI({
      model,
      temperature,
      
      configuration: { baseURL: "https://openrouter.ai/api/v1", apiKey: openRouterKey },
    });
  }
  if (openaiKey) {
    // Strip openrouter-style "openai/" prefix for direct OpenAI
    const openaiModel = model.replace(/^openai\//, "");
    return new ChatOpenAI({
      model: openaiModel,
      temperature,
      maxTokens,
      apiKey: openaiKey,
    });
  }
  throw new Error("Set OPENAI_API_KEY or OPENROUTER_API_KEY in .env");
}
