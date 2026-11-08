/**
 * Lab 2: the smallest possible LangChain agent.
 *
 * It has no tools, so the agent makes one model call and returns:
 * validate the input -> send system + user prompts -> read the reply.
 */
import "dotenv/config";
import { createAgent } from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";
// import { ChatOpenAI } from "@langchain/openai";
import { AIMessage } from "@langchain/core/messages";


const MAX_SUBJECT_LENGTH = 80;

// The system prompt sets rules for every run. The user prompt (in main) carries the subject.
const DEFAULT_SYSTEM_PROMPT = `You write short, happy stories for young children (ages 4–8).

Rules:
- Write at most 5 sentences total.
- Use simple words and a warm, cheerful tone.
- End on a positive note.
- Do not include a title, labels, or metadata—only the story text.`;

function usage() {
  console.log(`Usage: npm run agent -- "<subject>"

Write a short happy kids story (max 5 sentences) about the subject.

Options:
  --system "<text>"   Override the system prompt for this run
  --help              Show this help

Environment (.env):
  OPENROUTER_API_KEY   Required
  OPENROUTER_MODEL     Default: openai/gpt-5.5 (also try openai/gpt-5.4)
  SYSTEM_PROMPT        Optional default system prompt

Subject must be at most ${MAX_SUBJECT_LENGTH} characters.

Example:
  npm run agent -- "a bunny who loves carrots"
`);
}

function parseArgs(argv) {
  const args = { subject: "", systemPrompt: process.env.SYSTEM_PROMPT?.trim() || "" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--system") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--system requires a value");
      }
      args.systemPrompt = value;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    args.subject = args.subject ? `${args.subject} ${arg}` : arg;
  }

  return args;
}

function validateSubject(subject) {
  const trimmed = subject.trim();
  if (!trimmed) {
    throw new Error("Please provide a story subject (max 80 characters).");
  }
  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Subject is too long (${trimmed.length} chars). Keep it to ${MAX_SUBJECT_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

// agent.invoke returns the whole conversation. The story is the last assistant message.
function getStoryText(result) {
  const messages = result?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof AIMessage || msg?.type === "ai" || msg?.role === "assistant") {
      const content = typeof msg.content === "string" ? msg.content : String(msg.content ?? "");
      if (content.trim()) return content.trim();
    }
  }
  throw new Error("Agent returned no story text.");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY. Copy .env.example to .env and add your key.");
    process.exit(1);
  }

  const subject = validateSubject(parsed.subject);
  const systemPrompt = (parsed.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
  const modelId = process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-opus-5.5";
  console.log(modelId)

  // temperature 0.8 gives varied stories; maxTokens caps the length and cost of a reply.
  const model = new ChatOpenRouter({
    model: modelId,
    apiKey,
    apiBaseUrl: "https://openrouter.ai/api/v1",
    temperature: 2,
    maxTokens: 400,
  });

  const agent = createAgent({
    model,
    tools: [],
    systemPrompt,
  });

  const userPrompt = `Write a short happy story for kids about: ${subject}`;

  console.log(`Model: ${modelId}`);
  console.log(`Subject: ${subject}\n`);

  const result = await agent.invoke({ // invoke agent 
    messages: [{ role: "user", content: userPrompt }],
  });
  // console.log(result)
  // console.log(JSON.stringify(result, null, 2))
  // debug mode print the whole conversation including the object 
  console.log(getStoryText(result));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
