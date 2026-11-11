/**
 * Main story agent, shared by the CLI (agent.js) and the HTTP API (src/server.ts).
 *
 * Unlike lab_2, this agent has tools, so it runs as a loop:
 * model -> tool call -> tool result -> model ... until the model replies with text.
 * The model decides whether to call a tool; the system prompt sets those rules.
 */
import { createAgent } from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";
import { AIMessage } from "@langchain/core/messages";
import { createGenerateStoryImageTool } from "../tools/generate-story-image.tool.js";
import { createSaveStoryImageTool } from "../tools/save-story-image.tool.js";
import { createTranslateStoryTool } from "../tools/translate-story.tool.js";
import {
  DEFAULT_TRANSLATION_MODEL,
  TRANSLATION_LANGUAGES,
  normalizeTranslateTo,
} from "../services/openrouter-translate.service.js";

export const MAX_SUBJECT_LENGTH = 80;

export const DEFAULT_SYSTEM_PROMPT = `You write short, happy stories for young children (ages 4–8).

Rules:
- Write at most 5 sentences total.
- Use simple words and a warm, cheerful tone.
- End on a positive note.
- Do not include a title, labels, or metadata—only the story text.
- You have access to generate_story_image, save_story_image, and translate_story tools.
- Call generate_story_image ONLY when the user explicitly asks for an image, picture, or illustration.
- generate_story_image returns an imageId; it does not save the file.
- Call save_story_image with that imageId ONLY when the user explicitly wants the image saved, or when you are told to save the illustration.
- Call translate_story ONLY when the user explicitly asks for a Spanish or Hebrew translation.
- When translation is requested, compose the complete English story first, then call translate_story with that full storyText and the requested targetLanguage ("spanish" or "hebrew").
- If the user did not ask for an image, do not call image tools.
- If the user did not ask for a translation, do not call translate_story.
- When an image is requested, compose the complete story first and pass it as storyText to generate_story_image.
- Your final message must contain only the complete English story text. Never mention tools, images, imageIds, file paths, or translations in it.`;

export function validateSubject(subject) {
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

// The reply is the last assistant message that has text. This is why the system
// prompt requires the final message to be the story and nothing else.
export function getStoryText(result) {
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

// Finds the path in the "Image saved to ..." text returned by save_story_image.
export function getSavedImagePath(result) {
  const messages = result?.messages ?? [];
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : String(msg.content ?? "");
    const match = content.match(/saved to (generated-images\/[^\s]+)/i);
    if (match) return match[1];
  }
  return null;
}

/**
 * Reads the structured payload returned by translate_story.
 * @returns {{ translatedStory: string, targetLanguage: string, languageLabel?: string, model?: string } | null}
 */
export function getTranslationFromResult(result) {
  const messages = result?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const name = msg?.name;
    if (name !== "translate_story") continue;

    const content = typeof msg.content === "string" ? msg.content : String(msg.content ?? "");
    if (!content.trim() || content.startsWith("Error")) continue;

    try {
      const parsed = JSON.parse(content);
      if (parsed?.success && typeof parsed.translatedStory === "string" && parsed.translatedStory.trim()) {
        return {
          translatedStory: parsed.translatedStory.trim(),
          targetLanguage: parsed.targetLanguage,
          languageLabel: parsed.languageLabel,
          model: parsed.model,
        };
      }
    } catch {
      // Ignore non-JSON tool payloads.
    }
  }
  return null;
}

function buildUserPrompt({ subject, generateImage, translateTo }) {
  const lines = [`Write a short happy story for kids about: ${subject}`];
  const followUps = [];

  if (generateImage) {
    followUps.push(
      "After writing the story, generate an illustration image for it, then save it to disk.",
    );
  }

  if (translateTo) {
    const language = TRANSLATION_LANGUAGES[translateTo];
    followUps.push(
      `After writing the story, translate it to ${language.label} using translate_story with targetLanguage="${translateTo}".`,
    );
  }

  if (followUps.length === 0) {
    return lines[0];
  }

  return `${lines[0]}\n\n${followUps.join("\n")}`;
}

/**
 * Run the kids-story agent and return the story (and optional image/translation).
 * @param {{ subject: string, generateImage?: boolean, translateTo?: string|null, systemPrompt?: string }} options
 */
export async function runKidsStory({
  subject,
  generateImage = false,
  translateTo = null,
  systemPrompt = "",
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Copy .env.example to .env and add your key.");
  }

  const validatedSubject = validateSubject(subject);
  const resolvedTranslateTo = normalizeTranslateTo(translateTo);

  if (translateTo && !resolvedTranslateTo) {
    throw new Error('translateTo must be "spanish", "hebrew", or omitted.');
  }

  const resolvedSystemPrompt = (
    systemPrompt?.trim() ||
    process.env.SYSTEM_PROMPT?.trim() ||
    DEFAULT_SYSTEM_PROMPT
  ).trim();
  const modelId = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-5.5";
  const imageModel = process.env.OPENROUTER_IMAGE_MODEL?.trim() || "openai/gpt-image-1-mini";
  const translationModel =
    process.env.OPENROUTER_TRANSLATION_MODEL?.trim() || DEFAULT_TRANSLATION_MODEL;

  const model = new ChatOpenRouter({
    model: modelId,
    apiKey,
    temperature: 0.8,
    maxTokens: 1200,
    modelKwargs: {
      reasoning: { effort: "medium", summary: "detailed" },
    },
  });

  // The sub-agent reuses this chat model for its reasoning and tool calling.
  // `imageModel` only produces pixels: it cannot act as a chat model.
  const generateStoryImageTool = createGenerateStoryImageTool({
    apiKey,
    imageModel,
    model,
  });
  const saveStoryImageTool = createSaveStoryImageTool();
  const translateStoryTool = createTranslateStoryTool({
    apiKey,
    translationModel,
  });

  const agent = createAgent({
    model,
    tools: [generateStoryImageTool, saveStoryImageTool, translateStoryTool],
    systemPrompt: resolvedSystemPrompt,
  });

  // The tools are always available. Only this wording makes the model use them.
  const userPrompt = buildUserPrompt({
    subject: validatedSubject,
    generateImage,
    translateTo: resolvedTranslateTo,
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: userPrompt }],
  });

  const story = getStoryText(result);
  const imagePath = generateImage ? getSavedImagePath(result) : null;
  const translation = resolvedTranslateTo ? getTranslationFromResult(result) : null;

  if (resolvedTranslateTo && !translation?.translatedStory) {
    throw new Error(`Translation to ${TRANSLATION_LANGUAGES[resolvedTranslateTo].label} was requested but not produced.`);
  }

  return {
    story,
    imagePath,
    modelId,
    imageModel: generateImage ? imageModel : null,
    translateTo: resolvedTranslateTo,
    translatedStory: translation?.translatedStory ?? null,
    translationModel: resolvedTranslateTo ? translation?.model || translationModel : null,
    result,
  };
}
