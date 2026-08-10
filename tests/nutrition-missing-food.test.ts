import assert from "node:assert/strict";
import test from "node:test";
import { nutritionFoodIntent } from "../lib/nutrition/food-intent.ts";
import { isSufficientNutritionFoodCandidate, rankNutritionFoodCandidates, selectNutritionFoodCandidate } from "../lib/nutrition/search-ranking.ts";
import { missingFoodProposalSchema, nutritionSanityWarning } from "../lib/nutrition/missing-food-validation.ts";

const usda = (name: string) => ({
  name,
  provider: "USDA" as const,
  type: "GENERIC",
});

test("missing-food intent normalizes safe aliases without inventing a provider identity", () => {
  assert.equal(nutritionFoodIntent("манатарка").canonicalName, "Porcini mushroom");
  assert.equal(nutritionFoodIntent("fresh porcini").canonicalName, "Fresh porcini");
});

test("unrelated mushroom variants are not sufficient porcini matches", () => {
  const candidates = [usda("Mushrooms, shiitake, cooked"), usda("Mushrooms, white, raw")];
  assert.equal(selectNutritionFoodCandidate("porcini mushroom", candidates), null);
  assert.equal(isSufficientNutritionFoodCandidate("porcini mushroom", candidates[0]!), false);
});

test("a weak top result never triggers ADD while a sufficient provider match remains in the ranked pool", () => {
  const weak = { name: "Porcini mushroom soup", provider: "OPEN_FOOD_FACTS" as const, type: "BRANDED", brandName: "Example" };
  const exact = usda("Porcini mushroom");
  assert.equal(selectNutritionFoodCandidate("porcini mushroom", [weak, exact]), exact);
});

test("an exact unverified community food is usable but remains below an exact trusted provider record", () => {
  const community = {
    id: "community-porcini",
    source: "USER",
    type: "USER_CREATED",
    isLocal: true,
    verificationStatus: "UNVERIFIED",
    name: "Porcini mushroom",
  };
  const trusted = usda("Porcini mushroom");
  assert.equal(selectNutritionFoodCandidate("porcini mushroom", [community])?.id, "community-porcini");
  assert.equal(rankNutritionFoodCandidates("porcini mushroom", [community, trusted])[0], trusted);
});

test("proposal schema accepts editable per-100-g nutrition and flags extreme macro inconsistency", () => {
  const proposal = missingFoodProposalSchema.parse({
    canonicalName: "Porcini mushroom",
    description: "Fresh/raw edible mushroom.",
    nutrition: { caloriesKcal: 26, proteinGrams: 3.1, carbohydrateGrams: 4.2, fatGrams: 0.4, fiberGrams: 2, sugarGrams: null, saturatedFatGrams: null, sodiumMg: 5 },
    defaultServingGrams: 100,
    confidence: 0.62,
    assumptions: ["Fresh/raw ordinary edible state."],
  });
  assert.equal(nutritionSanityWarning(proposal.nutrition), false);
  assert.equal(nutritionSanityWarning({ ...proposal.nutrition, caloriesKcal: 20, proteinGrams: 20 }), true);
});

test("missing-food save path preserves provenance and revision architecture", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/nutrition/missing-food.ts", import.meta.url), "utf8"));
  assert.match(source, /FoodType\.USER_CREATED/);
  assert.match(source, /FoodSource\.USER/);
  assert.match(source, /FoodVerificationStatus\.UNVERIFIED/);
  assert.match(source, /Math\.min\(proposal\.confidence, 0\.75\)/);
  assert.match(source, /tx\.foodRevision\.create/);
  assert.match(source, /createdByUserId/);
  assert.match(source, /P2002/);
});

test("search and AI Scan expose an explicit contribution only after the shared candidate gate", async () => {
  const fs = await import("node:fs/promises");
  const [service, aiScan, searchUi] = await Promise.all([
    fs.readFile(new URL("../lib/nutrition/service.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/api/nutrition/ai-scan/route.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../components/nutrition/NutritionFoodSearch.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(service, /!selectNutritionFoodCandidate\(intent\.rankQuery, results\)/);
  assert.match(aiScan, /missingIntent: match\?\.food \? null/);
  assert.match(searchUi, /Not in Calistheni yet/);
  assert.match(searchUi, /action: "generate"/);
});

test("pending contributions use one creator-scoped visibility policy across search and logging", async () => {
  const fs = await import("node:fs/promises");
  const [visibility, service, entries, meals] = await Promise.all([
    fs.readFile(new URL("../lib/nutrition/food-visibility.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../lib/nutrition/service.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/api/nutrition/entries/batch/route.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/api/nutrition/meals/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(visibility, /FoodContributionStatus\.PENDING/);
  assert.match(visibility, /createdByUserId: userId/);
  assert.match(visibility, /FoodContributionStatus\.APPROVED/);
  assert.match(service, /nutritionFoodVisibilityWhere\(userId\)/);
  assert.match(entries, /nutritionFoodVisibilityWhere\(userId\)/);
  assert.match(meals, /nutritionFoodVisibilityWhere\(userId\)/);
});

test("ADD exposes loading, diagnostics, and an inline retry instead of failing silently", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionFoodSearch.tsx", import.meta.url), "utf8"));
  assert.match(source, /\[MissingFood\] ADD clicked/);
  assert.match(source, /Preparing nutrition suggestion/);
  assert.match(source, /proposalError/);
  assert.match(source, /Try again/);
});
