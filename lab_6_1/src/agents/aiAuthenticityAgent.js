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

/** Defaults tuned from lab rankings: gpt-5.6-sol > gpt-6-astra; keep DeepSeek + Claude as dissenters. */
const DEFAULT_MODELS = {
  A: "openai/gpt-5.6-sol",
  B: "deepseek/deepseek-v4.1-flash-1017",
  C: "anthropic/claude-sonnet-5.5",
};

/** Soft-cap overconfident votes (rankings: high-conf "real" drowned correct AI dissenters). */
const CONFIDENCE_CAP = 0.85;
/** Spread (max−min aiLikelihood) that counts as strong model disagreement. */
const DISAGREE_SPREAD = 40;
/** Minimum top aiLikelihood to treat a dissenting AI vote as meaningful. */
const STRONG_AI_VOTE = 70;
/**
 * Verdict thresholds — tightened vs original 40/60 because false negatives
 * dominated user labels (AI images scored ~20–35 overall).
 */
const VERDICT_REAL_MAX = 35;
const VERDICT_INCONCLUSIVE_MAX = 55;

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
 * Soften and cap confidence so one overconfident model cannot dominate.
 * @param {number} confidence
 */
function effectiveConfidence(confidence) {
  const capped = Math.min(Math.max(confidence, 0), CONFIDENCE_CAP);
  return Math.sqrt(capped);
}

/**
 * Confidence-weighted mean using softened confidence.
 * @param {Array<{ aiLikelihood: number, confidence: number }>} assessments
 */
function weightedLikelihood(assessments) {
  const weights = assessments.map((a) => effectiveConfidence(a.confidence));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum === 0) {
    return (
      assessments.reduce((sum, a) => sum + a.aiLikelihood, 0) /
      assessments.length
    );
  }
  return (
    assessments.reduce(
      (sum, a, i) => sum + a.aiLikelihood * weights[i],
      0,
    ) / weightSum
  );
}

/**
 * When models strongly disagree and at least one casts a strong AI vote,
 * blend toward that vote so a high-conf "real" majority cannot bury it.
 * @param {Array<{ aiLikelihood: number, confidence: number }>} assessments
 * @param {number} weighted
 */
function applyDisagreementAiBoost(assessments, weighted) {
  const scores = assessments.map((a) => a.aiLikelihood);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const mid = [...scores].sort((a, b) => a - b)[1];
  if (max - min >= DISAGREE_SPREAD && max >= STRONG_AI_VOTE) {
    return 0.35 * weighted + 0.45 * max + 0.2 * mid;
  }
  return weighted;
}

/**
 * Map overall score → verdict (thresholds tuned from classification rankings).
 * @param {number} overallAiLikelihood
 * @returns {"likely_real" | "inconclusive" | "likely_ai"}
 */
export function likelihoodToVerdict(overallAiLikelihood) {
  if (overallAiLikelihood <= VERDICT_REAL_MAX) return "likely_real";
  if (overallAiLikelihood <= VERDICT_INCONCLUSIVE_MAX) return "inconclusive";
  return "likely_ai";
}

/**
 * Confidence-weighted aggregate of three assessments (code-owned scores).
 * Uses capped/sqrt confidence and an AI-leaning disagreement boost — ranking
 * data showed false negatives when one model correctly scored AI highly but
 * two overconfident "real" votes won the plain weighted average.
 *
 * @param {Array<{ model: string, aiLikelihood: number, confidence: number, signals: string[], reason: string }>} assessments
 */
export function aggregateAssessments(assessments) {
  if (assessments.length !== 3) {
    throw new Error(
      `Expected 3 authenticity assessments, got ${assessments.length}.`,
    );
  }

  const weighted = weightedLikelihood(assessments);
  const overallAiLikelihood = Math.round(
    Math.min(100, Math.max(0, applyDisagreementAiBoost(assessments, weighted))),
  );
  const verdict = likelihoodToVerdict(overallAiLikelihood);

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
  const spread =
    Math.max(...assessments.map((a) => a.aiLikelihood)) -
    Math.min(...assessments.map((a) => a.aiLikelihood));
  const disagreeNote =
    spread >= DISAGREE_SPREAD
      ? ` Strong model disagreement (spread ${spread}); AI-leaning blend applied.`
      : "";
  const summary =
    recurring.length > 0
      ? `Models scored ${scores}; recurring cues: ${recurring.join(", ")}. Weighted overall ${overallAiLikelihood} → ${verdict}.${disagreeNote}`
      : `Models scored ${scores} with limited shared cues. Weighted overall ${overallAiLikelihood} → ${verdict}.${disagreeNote}`;

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
