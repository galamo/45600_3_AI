import { z } from "zod";




export const assessmentSchema = z.object({
  model: z.string(),
  aiLikelihood: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  reason: z.string(),
});

export const aiAuthenticitySchema = z.object({
  overallAiLikelihood: z.number().int().min(0).max(100),
  verdict: z.enum(["likely_real", "inconclusive", "likely_ai"]),
  summary: z.string().min(1),
  assessments: z.array(assessmentSchema).length(3),
});
