import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { checkAiAuthenticity } from "../agents/aiAuthenticityAgent.js";

/**
 * Build a tool that runs multi-model AI authenticity scoring for the current upload.
 * Bound to one source file path per agent run.
 *
 * @param {string} sourceFilePath - Absolute path of the uploaded image
 */
export function createIsAiAuthenticityTool(sourceFilePath) {
  return tool(
    async () => {
      try {
        const result = await checkAiAuthenticity(sourceFilePath);
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err?.message || String(err),
        });
      }
    },
    {
      name: "check_ai_authenticity",
      description:
        "Score whether the image is AI-generated or heavily AI-edited using three vision models. " +
        "Call at most once, and ONLY when the client requested AI authenticity (isAiAuthenticity is true). " +
        "Copy the returned JSON into aiAuthenticity without inventing or altering scores.",
      schema: z.object({}),
    },
  );
}
