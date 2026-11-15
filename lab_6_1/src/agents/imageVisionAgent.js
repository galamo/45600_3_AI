import { ChatOpenRouter } from "@langchain/openrouter";
import { createAgent } from "langchain";
import { visionResultSchema } from "../schemas/visionResultSchema.js";
import {
  VISION_SYSTEM_PROMPT,
  VISION_USER_INSTRUCTION,
} from "../prompts/visionPrompt.js";
import { imageToBase64DataUrl } from "../lib/vision.js";
import { createSaveImageTool } from "../tools/saveImageTool.js";

/**
 * Analyze an image file with an OpenRouter vision model.
 * Uses createAgent + responseFormat so the API always gets { tags, description }.
 * The agent may also call save_image to archive a copy under uploads/saved/.
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

  const saveImageTool = createSaveImageTool(filePath);

  const agent = createAgent({
    model,
    tools: [saveImageTool],
    systemPrompt: VISION_SYSTEM_PROMPT,
    responseFormat: visionResultSchema,
  });

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_USER_INSTRUCTION },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  console.log(result);
  return visionResultSchema.parse(result.structuredResponse);
}
