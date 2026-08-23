import "server-only";

import { selectDescribeNutritionCandidates } from "./ai-provider";
import type { DescribedMealResult } from "./describe";
import {
  isSufficientNutritionFoodCandidate,
  rankNutritionFoodCandidates,
  scoreNutritionFoodCandidate,
} from "./search-ranking";
import { getNutritionCandidatesForIntent, importExternalFood, toFoodSummary } from "./service";
import { nutritionFoodIntent } from "./food-intent";
import {
  isSuitableAiMealFoodCandidate,
  rankAiMealFoodCandidates,
  scoreAiMealFoodCandidate,
} from "./ai-meal-food-matching";
import type { ExternalFoodResult, FoodSummary } from "./types";
import { prisma } from "@/lib/prisma";

export const NUTRITION_DESCRIBE_CANDIDATE_LIMIT = 5;
export const NUTRITION_DESCRIBE_AUTO_MATCH_THRESHOLD = 400;
export const NUTRITION_DESCRIBE_AUTO_MATCH_MARGIN = 85;
export const NUTRITION_DESCRIBE_AI_MATCH_THRESHOLD = 0.8;
export const NUTRITION_REVIEW_MATCH_THRESHOLD = 0.6;
export const NUTRITION_AUTO_MATCH_THRESHOLD = 0.85;

type Candidate = FoodSummary | ExternalFoodResult;
type Concept = DescribedMealResult["foods"][number];

function debugCandidateResolution(stage: string, payload: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[Nutrition candidate resolver] ${stage}`, payload);
  }
}

export type DescribeResolution = Concept & {
  food: FoodSummary | null;
  confidence: number | null;
  needsReview: boolean;
  candidates: Candidate[];
};

function intentFor(concept: Concept) {
  return nutritionFoodIntent(
    [concept.preparation, concept.label].filter(Boolean).join(" ")
  );
}

function providerFor(candidate: ExternalFoodResult) {
  return candidate.provider;
}

async function canonicalSummary(foodId: string) {
  const food = await prisma.food.findUniqueOrThrow({
    where: { id: foodId },
    include: {
      aliases: { select: { name: true } },
      details: { select: { categories: true, productImageUrl: true } },
      servings: { select: { name: true, quantity: true, grams: true, householdUnit: true } },
    },
  });
  return toFoodSummary(food);
}

async function canonicalize(candidate: Candidate): Promise<FoodSummary> {
  if ("id" in candidate && candidate.id) return candidate;
  const imported = await importExternalFood(providerFor(candidate as ExternalFoodResult), (candidate as ExternalFoodResult).externalId);
  return canonicalSummary(imported.id);
}

export function getObviousDescribeCandidate(query: string, candidates: Candidate[], aiDetectedQuery?: string) {
  const ranked = aiDetectedQuery
    ? rankAiMealFoodCandidates(aiDetectedQuery, query, candidates)
    : rankNutritionFoodCandidates(query, candidates);
  const [top, second] = ranked;
  const isSufficient = (candidate: Candidate) => aiDetectedQuery
    ? isSuitableAiMealFoodCandidate(aiDetectedQuery, query, candidate)
    : isSufficientNutritionFoodCandidate(query, candidate);
  const score = (candidate: Candidate) => aiDetectedQuery
    ? scoreAiMealFoodCandidate(aiDetectedQuery, query, candidate)
    : scoreNutritionFoodCandidate(query, candidate);
  if (!top || !isSufficient(top)) {
    debugCandidateResolution("rejected automatic match", {
      query,
      top: top ? { name: top.name, score: score(top), reason: "weak-or-derivative" } : null,
    });
    return null;
  }
  const topScore = score(top);
  const margin = topScore - (second ? score(second) : 0);
  const obvious = topScore >= NUTRITION_DESCRIBE_AUTO_MATCH_THRESHOLD && margin >= NUTRITION_DESCRIBE_AUTO_MATCH_MARGIN;
  debugCandidateResolution(obvious ? "selected deterministic match" : "ambiguous deterministic match", {
    query,
    top: { name: top.name, score: topScore },
    second: second ? { name: second.name, score: score(second) } : null,
    margin,
  });
  return obvious ? top : null;
}

/**
 * Server-owned candidate collection for Describe. It uses the identical merged
 * local/USDA/OFF search universe as Food search, then sends only opaque top-N
 * choices to the contextual selector. No provider record is imported here.
 */
export async function resolveDescribedFoods(description: string, concepts: DescribedMealResult["foods"], userId?: string, options?: { aiMealPhoto?: boolean }): Promise<DescribeResolution[]> {
  const gathered = await Promise.all(concepts.map(async (concept, index) => {
      const intent = intentFor(concept);
      const query = intent.rankQuery;
      const detectedQuery = [concept.preparation, concept.label].filter(Boolean).join(" ");
    try {
      const candidates = await getNutritionCandidatesForIntent(
        detectedQuery,
        NUTRITION_DESCRIBE_CANDIDATE_LIMIT,
        userId,
        options
      ) as Candidate[];
      debugCandidateResolution("candidate pool", {
        label: concept.label,
        query,
        candidates: candidates.map((candidate) => ({
          name: candidate.name,
          source: "provider" in candidate ? candidate.provider : candidate.source,
          score: scoreNutritionFoodCandidate(query, candidate),
        })),
      });
      const rankedCandidates = options?.aiMealPhoto
        ? rankAiMealFoodCandidates(detectedQuery, query, candidates)
        : candidates;
      return { concept, key: `concept_${index + 1}`, query, detectedQuery, candidates: rankedCandidates, obvious: getObviousDescribeCandidate(query, rankedCandidates, options?.aiMealPhoto ? detectedQuery : undefined) };
    } catch {
      return { concept, key: `concept_${index + 1}`, query, detectedQuery, candidates: [] as Candidate[], obvious: null };
    }
  }));

  const ambiguous = gathered.filter((entry) => !entry.obvious && entry.candidates.length);
  let selections = new Map<string, { candidateId: string | null; confidence: number }>();
  if (ambiguous.length) {
    try {
      const selected = await selectDescribeNutritionCandidates({
        meal: description,
        concepts: ambiguous.map((entry) => ({
          key: entry.key,
          label: entry.concept.label,
          preparation: entry.concept.preparation,
          candidates: entry.candidates.map((candidate, index) => ({
            id: `candidate_${index + 1}`,
            name: candidate.name,
            brandName: candidate.brandName,
          })),
        })),
      });
      selections = new Map(selected.map((selection) => [selection.key, selection]));
    } catch {
      // A second-stage outage must not discard deterministic matches or the
      // stage-one concepts. Ambiguous concepts simply remain review-required.
    }
  }

  return Promise.all(gathered.map(async (entry): Promise<DescribeResolution> => {
    let selected = entry.obvious;
    let confidence: number | null = selected ? 1 : null;
    if (!selected) {
      const selection = selections.get(entry.key);
      const index = selection?.candidateId ? Number(selection.candidateId.replace("candidate_", "")) - 1 : -1;
      const candidate = Number.isInteger(index) ? entry.candidates[index] : null;
      const suitable = candidate && (options?.aiMealPhoto
        ? isSuitableAiMealFoodCandidate(entry.detectedQuery, entry.query, candidate)
        : isSufficientNutritionFoodCandidate(entry.query, candidate));
      if (candidate && selection && selection.confidence >= NUTRITION_DESCRIBE_AI_MATCH_THRESHOLD && suitable) {
        selected = candidate;
        confidence = selection.confidence;
      }
    }
    // A usable generic top candidate is better review material than an empty
    // row. It remains explicitly review-required unless the deterministic or
    // contextual selector reached the automatic threshold.
    if (!selected) {
      const fallback = entry.candidates.find((candidate) => options?.aiMealPhoto
        ? isSuitableAiMealFoodCandidate(entry.detectedQuery, entry.query, candidate)
        : isSufficientNutritionFoodCandidate(entry.query, candidate));
      if (fallback) {
        selected = fallback;
        confidence = Math.max(
          NUTRITION_REVIEW_MATCH_THRESHOLD,
          selections.get(entry.key)?.confidence ?? 0
        );
      }
    }
    if (!selected) {
      return {
        ...entry.concept,
        food: null,
        confidence: null,
        needsReview: true,
        candidates: entry.candidates,
      };
    }
    try {
      const food = await canonicalize(selected);
      debugCandidateResolution("selected canonical food", {
        detected: entry.detectedQuery,
        name: food.name,
        provider: food.source,
        providerId: food.sourceExternalId,
      });
      return {
        ...entry.concept,
        food,
        confidence,
        needsReview: (confidence ?? 0) < NUTRITION_AUTO_MATCH_THRESHOLD,
        candidates: entry.candidates,
      };
    } catch {
      return {
        ...entry.concept,
        food: null,
        confidence: null,
        needsReview: true,
        candidates: entry.candidates,
      };
    }
  }));
}
