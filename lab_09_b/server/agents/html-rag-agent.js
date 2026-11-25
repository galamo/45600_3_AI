/**
 * HTML RAG Agent: answer simple questions using retrieved HTML content.
 * Input: user question
 * Output: natural-language answer based on retrieved chunks
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel } from "../lib/llm.js";
import { getHtmlVectorStore } from "../lib/html-vector-store.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("HTML RAG Agent", "green");

function createModel() {
  return createChatModel({
    model: process.env.TESTING_MODEL || "openai/gpt-4o-mini",
    temperature: 0.2,
  });
}

/**
 * Answer a simple question using HTML RAG context.
 * @param {string} question
 * @param {number} [k] - number of chunks to retrieve
 * @returns {Promise<string>}
 */
export async function answerWithHtmlRag(question, k = 6) {
  const startedAt = log.start(question);

  // Step 1: retrieve the top-k chunks. similaritySearchWithScore (instead of a plain retriever)
  // also returns the cosine distance, so the log shows how close each chunk is (lower = closer).
  const store = await log.time("connect to vector store html_vectors", () => getHtmlVectorStore());
  const results = await log.time(`similarity search (k=${k})`, () => store.similaritySearchWithScore(question, k));
  log.chunks("html_vectors", k, results);
  const docs = results.map(([doc]) => doc);
  const context = docs.map((d) => d.pageContent).join("\n\n---\n\n") || "No relevant content found.";
  if (!docs.length) log.warn("no chunks found; the model will answer without context");

  // Step 2: answer from the retrieved context only.
  const model = createModel();
  const systemContent = `You are a helpful assistant. Answer the user's question in natural language using ONLY the following context from documentation or web content. Be concise. If the context does not contain the answer, say so. Do not make up information.`;
  const userContent = `Context:\n${context}\n\nQuestion: ${question}`;
  log.info(`context size: ${context.length} chars from ${docs.length} chunk(s)`);

  const messages = [
    new SystemMessage({ content: systemContent }),
    new HumanMessage({ content: userContent }),
  ];
  const response = await log.llm("answer from context", model, messages);
  const answer = typeof response.content === "string"
    ? response.content
    : response.content?.map((c) => (c.type === "text" ? c.text : "")).join("") || "";
  log.end(startedAt, answer);
  return answer;
}
