import { z } from "zod";
import { assessmentSchema } from "./aiAuthenticitySchema.js";

/** User picks only strong labels — no inconclusive middle. */
export const USER_CLASSIFICATION_VALUES = ["likely_real", "likely_ai"];

export const userClassificationEnum = z.enum(USER_CLASSIFICATION_VALUES);

export const modelRankingSchema = z.object({
  model: z.string().min(1),
  aiLikelihood: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  /** Binary mapping of the model score for comparison (excludes inconclusive). */
  classification: userClassificationEnum,
  signals: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

export const classificationRecordSchema = z.object({
  id: z.string().min(1),
  imageId: z.string().min(1),
  imageUrl: z.string().min(1),
  createdAt: z.string().datetime(),
  userClassification: userClassificationEnum,
  agentVerdict: z.enum(["likely_real", "inconclusive", "likely_ai"]),
  agentOverallAiLikelihood: z.number().int().min(0).max(100),
  /** Agent binary label used for agreement (inconclusive excluded via score threshold). */
  agentClassification: userClassificationEnum,
  modelRankings: z.array(modelRankingSchema).min(1),
  assessments: z.array(assessmentSchema).optional(),
});

export const saveClassificationBodySchema = z.object({
  imageId: z.string().min(1),
  imageUrl: z.string().min(1),
  userClassification: userClassificationEnum,
  aiAuthenticity: z.object({
    overallAiLikelihood: z.number().int().min(0).max(100),
    verdict: z.enum(["likely_real", "inconclusive", "likely_ai"]),
    summary: z.string().optional(),
    assessments: z.array(assessmentSchema).min(1),
  }),
});

/**
 * Map a 0–100 AI likelihood to a strong user-style label (no middle).
 * ≤50 → likely_real, ≥51 → likely_ai
 *
 * @param {number} aiLikelihood
 * @returns {"likely_real" | "likely_ai"}
 */
export function likelihoodToStrongClassification(aiLikelihood) {
  return aiLikelihood <= 50 ? "likely_real" : "likely_ai";
}
