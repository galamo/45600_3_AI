/**
 * Model factories. All chat models go through OpenRouter (ChatOpenRouter);
 * embeddings use OpenRouter's OpenAI-compatible /embeddings endpoint.
 */
import { ChatOpenRouter } from "@langchain/openrouter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { getEnv } from "../config/env.js";

export function createChatModel(model: string, temperature = 0): ChatOpenRouter {
  const env = getEnv();
  return new ChatOpenRouter({
    model,
    apiKey: env.OPENROUTER_API_KEY,
    temperature,
    // Cap output so OpenRouter doesn't reserve the model's (huge) default budget.
    maxTokens: env.LLM_MAX_TOKENS,
  });
}

let embeddings: OpenAIEmbeddings | null = null;

export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddings) {
    const env = getEnv();
    embeddings = new OpenAIEmbeddings({
      model: env.OPENROUTER_EMBEDDING_MODEL,
      apiKey: env.OPENROUTER_API_KEY,
      dimensions: env.EMBEDDING_DIMENSION,
      configuration: { baseURL: env.OPENROUTER_BASE_URL },
    });
  }
  return embeddings;
}
