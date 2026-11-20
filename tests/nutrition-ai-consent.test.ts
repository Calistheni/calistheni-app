import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hasNutritionAiConsent,
  NUTRITION_AI_CONSENT_HEADERS,
} from "../lib/nutrition/ai-consent";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("nutrition AI requires an explicit affirmative request marker", () => {
  const headers = new Headers();
  assert.equal(hasNutritionAiConsent(headers), false);
  headers.set("X-Calistheni-Nutrition-AI-Consent", "0");
  assert.equal(hasNutritionAiConsent(headers), false);
  headers.set("X-Calistheni-Nutrition-AI-Consent", "true");
  assert.equal(hasNutritionAiConsent(headers), false);
  assert.equal(hasNutritionAiConsent(new Headers(NUTRITION_AI_CONSENT_HEADERS)), true);
});

test("each OpenAI route checks consent before reserving quota or using OpenAI", async () => {
  for (const path of [
    "ai-scan",
    "describe",
    "foods/barcode/extract-label",
    "foods/propose",
  ]) {
    const route = await source(`app/api/nutrition/${path}/route.ts`);
    const guard = route.indexOf("if (!hasNutritionAiConsent(request.headers))");
    const quota = route.indexOf("await reserveNutritionAiQuota(");
    assert.ok(guard >= 0 && guard < quota, path);
    assert.match(route.slice(guard, quota), /"CONSENT_REQUIRED"/);
    if (path === "foods/propose") {
      assert.match(route.slice(0, guard), /if \(parsed\.data\.action === "save"\)[\s\S]*await saveMissingFood\(/);
    }
  }
});

test("all user-initiated AI submissions use the OpenAI confirmation, including Describe retry", async () => {
  const [ui, dialog, search] = await Promise.all([
    source("components/nutrition/NutritionQuickActions.tsx"),
    source("components/nutrition/NutritionAiConsentDialog.tsx"),
    source("components/nutrition/NutritionFoodSearch.tsx"),
  ]);
  assert.match(dialog, /Send to OpenAI\?/);
  assert.match(dialog, /onOpenChange=\{[\s\S]*?request\?\.onCancel\?\.\(\);/);
  assert.match(dialog, /<AlertDialogAction[\s\S]*?request\?\.onApprove\(\);/);
  for (const call of [
    "extractLabel(file)",
    "analyze()",
    "findFoods()",
    "proposeMissingSuggestion(suggestion)",
    "proposeMissingFood(item)",
  ]) {
    assert.equal(ui.split(`onApprove: () => void ${call}`).length, 2, call);
    assert.equal(ui.split(`void ${call}`).length, 2, call);
  }
  assert.match(ui, /onClick=\{requestDescribeConsent\}/);
  assert.equal(ui.match(/headers:.*NUTRITION_AI_CONSENT_HEADERS/g)?.length, 5);
  assert.match(search, /<NutritionAiConsentDialog request=\{aiConsent\}/);
  assert.equal(search.split("void startProposal(name)").length, 2);
  assert.match(search, /onApprove: \(\) => void startProposal\(name\)/);
  assert.match(search, /NUTRITION_AI_CONSENT_HEADERS \},\s*body: JSON\.stringify\(\{ action: "generate"/);
});
