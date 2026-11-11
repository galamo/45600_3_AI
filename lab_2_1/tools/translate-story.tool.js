import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  translateStoryText,
  TRANSLATION_LANGUAGES,
} from "../services/openrouter-translate.service.js";

/**
 * Tool that translates a finished kids story via a dedicated OpenRouter MT model.
 */
export function createTranslateStoryTool({ apiKey, translationModel }) {
  const languageKeys = Object.keys(TRANSLATION_LANGUAGES);

  return tool(
    async ({ storyText, targetLanguage }) => {
      const trimmedStory = storyText.trim();
      if (!trimmedStory) {
        return "Error: storyText is required to translate the story.";
      }

      if (!TRANSLATION_LANGUAGES[targetLanguage]) {
        return `Error: unsupported targetLanguage "${targetLanguage}". Use one of: ${languageKeys.join(", ")}.`;
      }

      try {
        const result = await translateStoryText({
          apiKey,
          storyText: trimmedStory,
          targetLanguage,
          model: translationModel,
        });

        return JSON.stringify({
          success: true,
          translatedStory: result.translatedStory,
          targetLanguage: result.targetLanguage,
          languageLabel: result.languageLabel,
          model: result.model,
          message: `Story translated to ${result.languageLabel}.`,
        });
      } catch (err) {
        return `Error translating story: ${err.message || String(err)}`;
      }
    },
    {
      name: "translate_story",
      description:
        "Translate a completed English kids story into Spanish or Hebrew using a dedicated translation model. " +
        "Call this ONLY when the user explicitly asks for a Spanish or Hebrew translation. " +
        "Pass the full finished story as storyText.",
      schema: z.object({
        storyText: z
          .string()
          .describe("The complete English story text to translate."),
        targetLanguage: z
          .enum(["spanish", "hebrew"])
          .describe('Target language: "spanish" or "hebrew".'),
      }),
    },
  );
}
