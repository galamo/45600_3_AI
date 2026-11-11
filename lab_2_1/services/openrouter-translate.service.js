import { ChatOpenRouter } from "@langchain/openrouter";

export const TRANSLATION_LANGUAGES = {
  spanish: { code: "es", label: "Spanish", nativeName: "Español" },
  hebrew: { code: "he", label: "Hebrew", nativeName: "עברית" },
};

export const DEFAULT_TRANSLATION_MODEL = "tencent/hy-mt2-30b-a3b";

/**
 * Normalize UI/API language values to a supported key.
 * @param {unknown} value
 * @returns {"spanish"|"hebrew"|null}
 */
export function normalizeTranslateTo(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key || key === "none" || key === "en" || key === "english") return null;
  if (key === "spanish" || key === "es" || key === "español" || key === "espanol") {
    return "spanish";
  }
  if (key === "hebrew" || key === "he" || key === "עברית" || key === "ivrit") {
    return "hebrew";
  }
  return null;
}

/**
 * Translate story text with a dedicated OpenRouter MT model.
 * Hy-MT2-30B-A3B is Tencent's specialist translation model (33 language pairs).
 * @param {{ apiKey: string, storyText: string, targetLanguage: "spanish"|"hebrew", model?: string }} options
 */
export async function translateStoryText({
  apiKey,
  storyText,
  targetLanguage,
  model = DEFAULT_TRANSLATION_MODEL,
}) {
  const language = TRANSLATION_LANGUAGES[targetLanguage];
  if (!language) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }

  const trimmed = storyText?.trim();
  if (!trimmed) {
    throw new Error("storyText is required for translation.");
  }

  const chat = new ChatOpenRouter({
    model,
    apiKey,
    temperature: 0.2,
    maxTokens: 1500,
  });

  const response = await chat.invoke([
    {
      role: "system",
      content:
        "You are a professional literary translator for children's stories. " +
        "Translate faithfully while keeping a warm, simple tone for ages 4–8. " +
        "Return only the translated story text — no title, notes, or explanations.",
    },
    {
      role: "user",
      content:
        `Translate the following children's story from English to ${language.label} (${language.nativeName}).\n\n` +
        `Story:\n${trimmed}`,
    },
  ]);

  const translated =
    typeof response.content === "string"
      ? response.content.trim()
      : String(response.content ?? "").trim();

  if (!translated) {
    throw new Error("Translation model returned empty text.");
  }

  return {
    translatedStory: translated,
    targetLanguage,
    languageLabel: language.label,
    model,
  };
}
