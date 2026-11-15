import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classificationRecordSchema,
  likelihoodToStrongClassification,
  saveClassificationBodySchema,
} from "../schemas/userClassificationSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "..", "data");
export const CLASSIFICATIONS_FILE = path.join(
  DATA_DIR,
  "classifications.json",
);

/**
 * @param {string} [dataDir]
 */
export async function ensureDataDir(dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
}

/**
 * @returns {Promise<import("zod").infer<typeof classificationRecordSchema>[]>}
 */
export async function readClassifications() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(CLASSIFICATIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const result = classificationRecordSchema.safeParse(item);
        return result.success ? result.data : null;
      })
      .filter(Boolean);
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * @param {import("zod").infer<typeof classificationRecordSchema>[]} records
 */
async function writeClassifications(records) {
  await ensureDataDir();
  await fs.writeFile(
    CLASSIFICATIONS_FILE,
    `${JSON.stringify(records, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Persist a user classification together with model rankings for an image.
 * Replaces any existing record for the same imageId.
 *
 * @param {unknown} body
 * @returns {Promise<import("zod").infer<typeof classificationRecordSchema>>}
 */
export async function saveUserClassification(body) {
  const input = saveClassificationBodySchema.parse(body);
  const agentClassification = likelihoodToStrongClassification(
    input.aiAuthenticity.overallAiLikelihood,
  );

  const modelRankings = input.aiAuthenticity.assessments.map((a) => ({
    model: a.model,
    aiLikelihood: a.aiLikelihood,
    confidence: a.confidence,
    classification: likelihoodToStrongClassification(a.aiLikelihood),
    signals: a.signals,
    reason: a.reason,
  }));

  const record = classificationRecordSchema.parse({
    id: `${input.imageId}-${Date.now()}`,
    imageId: input.imageId,
    imageUrl: input.imageUrl,
    createdAt: new Date().toISOString(),
    userClassification: input.userClassification,
    agentVerdict: input.aiAuthenticity.verdict,
    agentOverallAiLikelihood: input.aiAuthenticity.overallAiLikelihood,
    agentClassification,
    modelRankings,
    assessments: input.aiAuthenticity.assessments,
  });

  const existing = await readClassifications();
  const next = existing.filter((r) => r.imageId !== record.imageId);
  next.push(record);
  await writeClassifications(next);
  return record;
}

/**
 * Build aggregate stats for the assessment dashboard.
 *
 * @param {import("zod").infer<typeof classificationRecordSchema>[]} records
 * @param {{ userClassification?: string, model?: string }} [filters]
 */
export function buildAssessmentStats(records, filters = {}) {
  let filtered = records;
  if (filters.userClassification) {
    filtered = filtered.filter(
      (r) => r.userClassification === filters.userClassification,
    );
  }
  if (filters.model) {
    filtered = filtered.filter((r) =>
      r.modelRankings.some((m) => m.model === filters.model),
    );
  }

  const total = filtered.length;
  const userCounts = { likely_real: 0, likely_ai: 0 };
  const agentCounts = {
    likely_real: 0,
    inconclusive: 0,
    likely_ai: 0,
  };
  const agentBinary = { likely_real: 0, likely_ai: 0 };
  let agentAgree = 0;
  let agentDisagree = 0;
  let agentInconclusiveVsUser = 0;

  /** @type {Map<string, { agree: number, disagree: number, total: number, userAi: number, userReal: number, modelAi: number, modelReal: number }>} */
  const perModel = new Map();

  for (const record of filtered) {
    userCounts[record.userClassification] += 1;
    agentCounts[record.agentVerdict] += 1;
    agentBinary[record.agentClassification] += 1;

    if (record.agentVerdict === "inconclusive") {
      agentInconclusiveVsUser += 1;
      agentDisagree += 1;
    } else if (record.agentClassification === record.userClassification) {
      agentAgree += 1;
    } else {
      agentDisagree += 1;
    }

    for (const ranking of record.modelRankings) {
      if (filters.model && ranking.model !== filters.model) continue;
      if (!perModel.has(ranking.model)) {
        perModel.set(ranking.model, {
          agree: 0,
          disagree: 0,
          total: 0,
          userAi: 0,
          userReal: 0,
          modelAi: 0,
          modelReal: 0,
        });
      }
      const stats = perModel.get(ranking.model);
      stats.total += 1;
      if (ranking.classification === "likely_ai") stats.modelAi += 1;
      else stats.modelReal += 1;
      if (record.userClassification === "likely_ai") stats.userAi += 1;
      else stats.userReal += 1;
      if (ranking.classification === record.userClassification) stats.agree += 1;
      else stats.disagree += 1;
    }
  }

  const models = [...perModel.entries()].map(([model, stats]) => ({
    model,
    ...stats,
    accuracy: stats.total === 0 ? 0 : Math.round((stats.agree / stats.total) * 100),
  }));

  return {
    total,
    filters,
    userCounts,
    agentCounts,
    agentBinary,
    agentVsUser: {
      agree: agentAgree,
      disagree: agentDisagree,
      wrongAccordingToUser: agentDisagree,
      inconclusiveWhenUserSure: agentInconclusiveVsUser,
      accuracy: total === 0 ? 0 : Math.round((agentAgree / total) * 100),
    },
    perModel: models,
    records: filtered.map((r) => ({
      imageId: r.imageId,
      imageUrl: r.imageUrl,
      createdAt: r.createdAt,
      userClassification: r.userClassification,
      agentVerdict: r.agentVerdict,
      agentClassification: r.agentClassification,
      agentOverallAiLikelihood: r.agentOverallAiLikelihood,
      agentCorrect: r.agentClassification === r.userClassification,
      modelRankings: r.modelRankings.map((m) => ({
        model: m.model,
        aiLikelihood: m.aiLikelihood,
        classification: m.classification,
        correct: m.classification === r.userClassification,
      })),
    })),
  };
}
