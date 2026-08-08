import "server-only";

import { selectDescribeNutritionCandidates } from "./ai-provider";
import type { DescribedMealResult } from "./describe";
import {
  isSufficientNutritionFoodCandidate,
  rankNutritionFoodCandidates,
  scoreNutritionFoodCandidate,
} from "./search-ranking";
import { getNutritionCandidatesForIntent, importExternalFood, toFoodSummary } from "./service";
import type { ExternalFoodResult, FoodSummary } from "./types";
import { prisma } from "@/lib/prisma";

export const NUTRITION_DESCRIBE_CANDIDATE_LIMIT = 5;
export const NUTRITION_DESCRIBE_AUTO_MATCH_THRESHOLD = 400;
export const NUTRITION_DESCRIBE_AUTO_MATCH_MARGIN = 85;
export const NUTRITION_DESCRIBE_AI_MATCH_THRESHOLD = 0.8;

type Candidate = FoodSummary | ExternalFoodResult;
type Concept = DescribedMealResult["foods"][number];

export type DescribeResolution = Concept & {
  food: FoodSummary | null;
  confidence: number | null;
};

function queryFor(concept: Concept) {
  return [concept.preparation, concept.label].filter(Boolean).join(" ");
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

export function getObviousDescribeCandidate(query: string, candidates: Candidate[]) {
  const [top, second] = rankNutritionFoodCandidates(query, candidates);
  if (!top || !isSufficientNutritionFoodCandidate(query, top)) return null;
  const topScore = scoreNutritionFoodCandidate(query, top);
  const margin = topScore - (second ? scoreNutritionFoodCandidate(query, second) : 0);
  return topScore >= NUTRITION_DESCRIBE_AUTO_MATCH_THRESHOLD && margin >= NUTRITION_DESCRIBE_AUTO_MATCH_MARGIN
    ? top
    : null;
}

/**
 * Server-owned candidate collection for Describe. It uses the identical merged
 * local/USDA/OFF search universe as Food search, then sends only opaque top-N
 * choices to the contextual selector. No provider record is imported here.
 */
export async function resolveDescribedFoods(description: string, concepts: DescribedMealResult["foods"]): Promise<DescribeResolution[]> {
  const gathered = await Promise.all(concepts.map(async (concept, index) => {
    const query = queryFor(concept);
    try {
      const candidates = await getNutritionCandidatesForIntent(query, NUTRITION_DESCRIBE_CANDIDATE_LIMIT) as Candidate[];
      return { concept, key: `concept_${index + 1}`, query, candidates, obvious: getObviousDescribeCandidate(query, candidates) };
    } catch {
      return { concept, key: `concept_${index + 1}`, query, candidates: [] as Candidate[], obvious: null };
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
      if (candidate && selection && selection.confidence >= NUTRITION_DESCRIBE_AI_MATCH_THRESHOLD && isSufficientNutritionFoodCandidate(entry.query, candidate)) {
        selected = candidate;
        confidence = selection.confidence;
      }
    }
    if (!selected) return { ...entry.concept, food: null, confidence: null };
    try {
      return { ...entry.concept, food: await canonicalize(selected), confidence };
    } catch {
      return { ...entry.concept, food: null, confidence: null };
    }
  }));
}
