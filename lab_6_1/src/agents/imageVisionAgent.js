import { ChatOpenRouter } from "@langchain/openrouter";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { visionResultSchema } from "../schemas/visionResultSchema.js";
import {
  VISION_SYSTEM_PROMPT,
  VISION_USER_INSTRUCTION,
} from "../prompts/visionPrompt.js";
import { imageToBase64DataUrl } from "../lib/vision.js";

/**
 * Analyze an image file with an OpenRouter vision model.
 * Uses structured output so the API always gets { tags, description }.
 *
 * @param {string} filePath - Absolute path to a saved PNG/JPEG
 * @returns {Promise<{ tags: string[], description: string }>}
 */
export async function analyzeImage(filePath) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in environment.");
  }

  const modelName =
    process.env.OPENROUTER_VISION_MODEL?.trim() || "google/gemini-3.8-flash";

  const { dataUrl } = imageToBase64DataUrl(filePath);

  const model = new ChatOpenRouter({
    model: modelName,
    temperature: 0,
    apiKey,
  });



 


  // Multimodal + structured Zod: withStructuredOutput is the reliable path
  // (createAgent responseFormat + image_url can be awkward in practice).
  const structured = model.withStructuredOutput(visionResultSchema);

  const result = await structured.invoke([
    new SystemMessage(VISION_SYSTEM_PROMPT),
    new HumanMessage({
      content: [
        { type: "text", text: VISION_USER_INSTRUCTION },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }),
  ]);

  return visionResultSchema.parse(result);
}
