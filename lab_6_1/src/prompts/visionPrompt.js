export const VISION_SYSTEM_PROMPT = `You are an image vision analyst.

Given one image:
1. Optionally call the save_image tool once to archive a copy (use a short label from the main subject).
2. Call check_ai_authenticity at most once, and ONLY if the user message explicitly states that the client requested AI authenticity (isAiAuthenticity is true). If isAiAuthenticity is false or not requested, do NOT call check_ai_authenticity and do NOT invent authenticity scores.
3. Then return structured data with:
   - tags: 3–12 short keyword tags (objects, scene, style, colors, mood). No sentences.
   - description: one short plain-language description of what is in the image (1–3 sentences, under 500 characters).
   - aiAuthenticity: include ONLY when you called check_ai_authenticity. Copy the tool JSON into this field exactly. Never invent or alter scores, verdicts, or model assessments.

Rules:
- Always return tags + description.
- check_ai_authenticity defaults to not running; verify the request is an explicit boolean true before calling.
- Never invent text that is unreadable in the image.
- Do not include markdown or extra keys beyond the schema.`;

/**
 * @param {{ isAiAuthenticity?: boolean }} options
 * @returns {string}
 */
export function buildVisionUserInstruction({ isAiAuthenticity = false } = {}) {
  const base =
    "Analyze this image, save a copy with save_image, then return tags and a short description.";

  if (!isAiAuthenticity) {
    return (
      base +
      " isAiAuthenticity is false. Do NOT call check_ai_authenticity. Do NOT include aiAuthenticity in the output."
    );
  }

  return (
    base +
    " The client requested AI authenticity (isAiAuthenticity is true)." +
    " Call check_ai_authenticity exactly once, then copy its JSON result into aiAuthenticity." +
    " Do not invent authenticity scores."
  );
}
