import { ChatOpenRouter } from "@langchain/openrouter";
import {
  AI_AUTHENTICITY_SYSTEM_PROMPT,
  AI_AUTHENTICITY_USER_PROMPT,
} from "../prompts/aiAuthenticityPrompt.js";
import {
  assessmentSchema,
  aiAuthenticitySchema,
} from "../schemas/aiAuthenticitySchema.js";
import { imageToBase64DataUrl } from "../lib/vision.js";

const DEFAULT_MODELS = {
  A: "openai/gpt-5.6-sol",
  B: "deepseek/deepseek-v4.1-flash-1017",
  C: "anthropic/claude-sonnet-5.5",
};

/**
 * @returns {string[]}
 */
function resolveAuthModels() {
  return [
    process.env.OPENROUTER_AUTH_MODEL_A?.trim() || DEFAULT_MODELS.A,
    process.env.OPENROUTER_AUTH_MODEL_B?.trim() || DEFAULT_MODELS.B,
    process.env.OPENROUTER_AUTH_MODEL_C?.trim() || DEFAULT_MODELS.C,
  ];
}


/**
 * Extract JSON object from model text (handles optional markdown fences).
 * @param {unknown} content
 * @returns {unknown}
 */
function parseJsonFromContent(content) {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              typeof part === "string"
                ? part
                : part?.type === "text"
                  ? part.text
                  : "",
            )
            .join("\n")
        : content?.text || String(content ?? "");

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain JSON object.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * @param {string} modelName
 * @param {string} dataUrl
 * @param {string} apiKey
 */
async function assessmentUsingModel(modelName, dataUrl, apiKey) {
  const model = new ChatOpenRouter({
    model: modelName,
    temperature: 0,
    apiKey,
  });

  const messages = [
    { role: "system", content: AI_AUTHENTICITY_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: AI_AUTHENTICITY_USER_PROMPT },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];

  let parsed;
  try {
    const structured = model.withStructuredOutput(assessmentSchema);
    parsed = await structured.invoke(messages);
  } catch {
    const response = await model.invoke(messages);
    parsed = parseJsonFromContent(response.content);
  }

  return assessmentSchema.parse({
    ...parsed,
    model: modelName,
  });
}

/**
 * Confidence-weighted aggregate of three assessments (code-owned scores).
 * @param {Array<{ model: string, aiLikelihood: number, confidence: number, signals: string[], reason: string }>} assessments
 */
export function aggregateAssessments(assessments) {
  if (assessments.length !== 3) {
    throw new Error(
      `Expected 3 authenticity assessments, got ${assessments.length}.`,
    );
  }

  const confidenceSum = assessments.reduce((sum, a) => sum + a.confidence, 0);
  let overallAiLikelihood;
  if (confidenceSum === 0) {
    overallAiLikelihood = Math.round(
      assessments.reduce((sum, a) => sum + a.aiLikelihood, 0) /
        assessments.length,
    );
  } else {
    overallAiLikelihood = Math.round(
      assessments.reduce(
        (sum, a) => sum + a.aiLikelihood * a.confidence,
        0,
      ) / confidenceSum,
    );
  }

  /** @type {"likely_real" | "inconclusive" | "likely_ai"} */
  let verdict;
  if (overallAiLikelihood <= 40) {
    verdict = "likely_real";
  } else if (overallAiLikelihood <= 60) {
    verdict = "inconclusive";
  } else {
    verdict = "likely_ai";
  }

  const signalCounts = new Map();
  for (const a of assessments) {
    for (const signal of a.signals) {
      const key = signal.trim().toLowerCase();
      if (!key) continue;
      signalCounts.set(key, (signalCounts.get(key) || 0) + 1);
    }
  }
  const recurring = [...signalCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([signal]) => signal)
    .slice(0, 3);

  const scores = assessments.map((a) => a.aiLikelihood).join(", ");
  const summary =
    recurring.length > 0
      ? `Models scored ${scores}; recurring cues: ${recurring.join(", ")}. Weighted overall ${overallAiLikelihood} → ${verdict}.`
      : `Models scored ${scores} with limited shared cues. Weighted overall ${overallAiLikelihood} → ${verdict}.`;

  return aiAuthenticitySchema.parse({
    overallAiLikelihood,
    verdict,
    summary,
    assessments,
  });
}

/**
 * Run three OpenRouter vision models in parallel and aggregate authenticity.
 *
 * @param {string} filePath - Absolute path to the image
 * @returns {Promise<import("zod").infer<typeof aiAuthenticitySchema>>}
 */
export async function checkAiAuthenticity(filePath) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in environment.");
  }

  const { dataUrl } = imageToBase64DataUrl(filePath);
  const models = resolveAuthModels();

  const results = await Promise.allSettled(
    models.map((modelName) => assessmentUsingModel(modelName, dataUrl, apiKey)),
  );

  const assessments = [];
  const failures = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      assessments.push(result.value);
    } else {
      failures.push({
        model: models[i],
        error: result.reason?.message || String(result.reason),
      });
    }
  }

  if (assessments.length !== 3) {
    const detail = failures
      .map((f) => `${f.model}: ${f.error}`)
      .join("; ");
    throw new Error(
      `AI authenticity requires 3 successful model assessments; got ${assessments.length}. ${detail}`,
    );
  }

  return aggregateAssessments(assessments);
}
