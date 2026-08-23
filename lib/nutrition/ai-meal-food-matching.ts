import { normalizeFoodQuery, nutritionFoodQueryVariants } from "./normalization";
import {
  isSufficientNutritionFoodCandidate,
  scoreNutritionFoodCandidate,
  type NutritionFoodCandidate,
} from "./search-ranking";

const COMPOSITE_DISH_TERMS = new Set([
  "bowl", "burger", "burrito", "casserole", "curry", "dip", "pasta",
  "pizza", "salad", "sandwich", "sauce", "soup", "spread", "stew", "wrap",
]);
const PREPARATION_TERMS = new Set([
  "baked", "boiled", "cooked", "fried", "grilled", "roasted", "steamed",
]);
const COOKED_PREPARATIONS = new Set([
  "baked", "boiled", "fried", "grilled", "roasted", "steamed",
]);
const DATABASE_WORDING = ["as ingredient"];

function words(value: string) {
  return normalizeFoodQuery(value).split(" ").filter(Boolean);
}

function matchingCompositeTerms(value: string) {
  return words(value).filter((word) => COMPOSITE_DISH_TERMS.has(word));
}

function candidateCoreName(candidate: NutritionFoodCandidate) {
  return normalizeFoodQuery(candidate.name.split(",")[0] ?? "");
}

function equivalentCanonicalName(query: string, candidate: NutritionFoodCandidate) {
  const queryVariants = new Set(nutritionFoodQueryVariants(query));
  return nutritionFoodQueryVariants(candidateCoreName(candidate)).some((variant) => queryVariants.has(variant));
}

function explicitlyNamesBrand(detectedQuery: string, candidate: NutritionFoodCandidate) {
  const brand = normalizeFoodQuery(candidate.brandName ?? "");
  return Boolean(brand && normalizeFoodQuery(detectedQuery).includes(brand));
}

/** AI-photo-only score layered over the shared search score. */
export function scoreAiMealFoodCandidate(
  detectedQuery: string,
  canonicalQuery: string,
  candidate: NutritionFoodCandidate,
) {
  const detectedComposite = matchingCompositeTerms(detectedQuery);
  const candidateComposite = matchingCompositeTerms(candidate.name);
  const simpleDetection = detectedComposite.length === 0;
  const normalizedName = normalizeFoodQuery(candidate.name);
  let score = scoreNutritionFoodCandidate(canonicalQuery, candidate);

  if (simpleDetection && candidateComposite.length) score -= 520;
  if (detectedComposite.length) {
    const matchingTerms = candidateComposite.filter((term) => detectedComposite.includes(term));
    score += matchingTerms.length * 240;
    if (!matchingTerms.length) score -= 180;
  }

  const requestedPreparations = words(detectedQuery).filter((word) => PREPARATION_TERMS.has(word));
  for (const preparation of requestedPreparations) {
    if (words(candidate.name).includes(preparation)) score += 180;
    else if (COOKED_PREPARATIONS.has(preparation) && words(candidate.name).includes("cooked")) score += 90;
    if (words(candidate.name).some((word) => word === "raw" || word === "uncooked")) score -= 160;
  }

  if (simpleDetection && equivalentCanonicalName(canonicalQuery, candidate)) score += 120;
  if (simpleDetection && candidate.brandName && !explicitlyNamesBrand(detectedQuery, candidate)) score -= 180;
  for (const wording of DATABASE_WORDING) if (normalizedName.includes(wording)) score -= 190;
  return score;
}

export function rankAiMealFoodCandidates<T extends NutritionFoodCandidate>(
  detectedQuery: string,
  canonicalQuery: string,
  candidates: readonly T[],
) {
  return [...candidates].sort((left, right) => {
    const difference = scoreAiMealFoodCandidate(detectedQuery, canonicalQuery, right)
      - scoreAiMealFoodCandidate(detectedQuery, canonicalQuery, left);
    return difference || left.name.localeCompare(right.name);
  });
}

export function isSuitableAiMealFoodCandidate(
  detectedQuery: string,
  canonicalQuery: string,
  candidate: NutritionFoodCandidate,
) {
  if (!isSufficientNutritionFoodCandidate(canonicalQuery, candidate)) return false;
  const detectedComposite = matchingCompositeTerms(detectedQuery);
  const candidateComposite = matchingCompositeTerms(candidate.name);
  return detectedComposite.length > 0 || candidateComposite.length === 0;
}

export function selectAiMealFoodCandidate<T extends NutritionFoodCandidate>(
  detectedQuery: string,
  canonicalQuery: string,
  candidates: readonly T[],
) {
  return rankAiMealFoodCandidates(detectedQuery, canonicalQuery, candidates).find((candidate) =>
    isSuitableAiMealFoodCandidate(detectedQuery, canonicalQuery, candidate)
  ) ?? null;
}

/** A local match is strong enough to skip providers only when it is canonical and clean. */
export function isCanonicalAiMealFoodCandidate(
  detectedQuery: string,
  canonicalQuery: string,
  candidate: NutritionFoodCandidate,
) {
  return isSuitableAiMealFoodCandidate(detectedQuery, canonicalQuery, candidate)
    && equivalentCanonicalName(canonicalQuery, candidate)
    && !DATABASE_WORDING.some((wording) => normalizeFoodQuery(candidate.name).includes(wording));
}
