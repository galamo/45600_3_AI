import { ChatOpenRouter } from "@langchain/openrouter";
import { createAgent } from "langchain";
import { visionResultSchema } from "../schemas/visionResultSchema.js";
import {
  VISION_SYSTEM_PROMPT,
  buildVisionUserInstruction,
} from "../prompts/visionPrompt.js";
import { imageToBase64DataUrl } from "../lib/vision.js";
import { createSaveImageTool } from "../tools/saveImageTool.js";
import { createIsAiAuthenticityTool } from "../tools/isAiAuthenticityTool.js";

/**
 * Analyze an image file with an OpenRouter vision model.
 * Uses createAgent + responseFormat so the API always gets { tags, description }.
 * The agent may also call save_image to archive a copy under uploads/saved/.
 * When isAiAuthenticity is true, it may call check_ai_authenticity once.
 *
 * @param {string} filePath - Absolute path to a saved PNG/JPEG
 * @param {{ isAiAuthenticity?: boolean }} [options]
 * @returns {Promise<{ tags: string[], description: string, aiAuthenticity?: object }>}
 */
export async function analyzeImage(filePath, { isAiAuthenticity = false } = {}) {
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

  const tools = [createSaveImageTool(filePath)];
  if (isAiAuthenticity) {
    tools.push(createIsAiAuthenticityTool(filePath));
  }

  const agent = createAgent({
    model,
    tools,
    systemPrompt: VISION_SYSTEM_PROMPT,
    responseFormat: visionResultSchema,
  });

  const userInstruction = buildVisionUserInstruction({ isAiAuthenticity });

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userInstruction },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const parsed = visionResultSchema.parse(result.structuredResponse);

  if (!isAiAuthenticity && parsed.aiAuthenticity) {
    const { aiAuthenticity: _drop, ...rest } = parsed;
    return rest;
  }

  return parsed;
}
