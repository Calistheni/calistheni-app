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
const SIMPLE_FORM_TERMS = new Set(["breast", "fillet", "fillets"]);
const DATABASE_WORDING = ["as ingredient", "as purchased", "unheated", "nfs"];
const DERIVATIVE_FOOD_TERMS = new Set(["nugget", "nuggets"]);

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

function isFineliPreparedSingleFood(candidate: NutritionFoodCandidate, canonicalQuery: string) {
  const fineli = candidate.provider === "FINELI" || candidate.source === "FINELI";
  return fineli
    && candidate.type === "RECIPE"
    && equivalentCanonicalName(canonicalQuery, candidate)
    && matchingCompositeTerms(candidate.name).length === 0;
}

function hasWeakGenericWording(detectedQuery: string, candidate: NutritionFoodCandidate) {
  const normalizedDetected = normalizeFoodQuery(detectedQuery);
  const normalizedName = normalizeFoodQuery(candidate.name);
  if (DATABASE_WORDING.some((wording) => normalizedName.includes(wording))) return true;
  return words(candidate.name).some((word) =>
    DERIVATIVE_FOOD_TERMS.has(word) && !words(normalizedDetected).includes(word)
  );
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
  let score = scoreNutritionFoodCandidate(canonicalQuery, candidate);

  if (simpleDetection && candidateComposite.length) score -= 520;
  if (detectedComposite.length) {
    const matchingTerms = candidateComposite.filter((term) => detectedComposite.includes(term));
    score += matchingTerms.length * 240;
    if (!matchingTerms.length) score -= 180;
  }

  const requestedPreparations = words(detectedQuery).filter((word) => PREPARATION_TERMS.has(word));
  const candidatePreparations = words(candidate.name).filter((word) => PREPARATION_TERMS.has(word));
  for (const preparation of requestedPreparations) {
    if (candidatePreparations.includes(preparation)) score += 220;
    else if (preparation === "cooked" && candidatePreparations.some((word) => COOKED_PREPARATIONS.has(word))) score += 180;
    else if (COOKED_PREPARATIONS.has(preparation) && candidatePreparations.includes("cooked")) score += 90;
    else if (candidatePreparations.length) score -= 260;
    if (words(candidate.name).some((word) => word === "raw" || word === "uncooked")) score -= 160;
  }

  if (simpleDetection && isFineliPreparedSingleFood(candidate, canonicalQuery)) score += 260;
  for (const form of words(detectedQuery).filter((word) => SIMPLE_FORM_TERMS.has(word))) {
    if (words(candidate.name).includes(form) || (form === "fillets" && words(candidate.name).includes("fillet"))) score += 180;
  }
  if (normalizeFoodQuery(canonicalQuery) === "banana") {
    if (normalizeFoodQuery(candidate.name).includes("without skin")) score += 150;
    if (normalizeFoodQuery(candidate.name).includes("with skin")) score -= 90;
  }
  if (simpleDetection && equivalentCanonicalName(canonicalQuery, candidate)) score += 120;
  if (simpleDetection && candidate.brandName && !explicitlyNamesBrand(detectedQuery, candidate)) score -= 180;
  if (simpleDetection && hasWeakGenericWording(detectedQuery, candidate)) score -= 560;
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
  const detectedComposite = matchingCompositeTerms(detectedQuery);
  const candidateComposite = matchingCompositeTerms(candidate.name);
  const simpleDetection = detectedComposite.length === 0;
  if (!isSufficientNutritionFoodCandidate(canonicalQuery, candidate)
    && !(simpleDetection && isFineliPreparedSingleFood(candidate, canonicalQuery))) return false;
  if (simpleDetection && hasWeakGenericWording(detectedQuery, candidate)) return false;
  return !simpleDetection || candidateComposite.length === 0;
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
    && !hasWeakGenericWording(detectedQuery, candidate);
}
