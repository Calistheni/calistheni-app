import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Nutrition AI Scan is Pro-gated before parsing, rate limiting, or provider work", async () => {
  const route = await source("app/api/nutrition/ai-scan/route.ts");
  const authenticated = route.indexOf("getAuthenticatedUserId()");
  const entitlements = route.indexOf("getUserEntitlements(userId)");
  const capability = route.indexOf("canUseNutritionAiScan(entitlements)");
  const configured = route.indexOf("nutritionAiConfigured()");
  const rateLimit = route.indexOf("consumeNutritionAiRateLimit(userId)");
  const formData = route.indexOf("request.formData()");
  const provider = route.indexOf("analyzeNutritionImage(");

  assert.ok(authenticated >= 0);
  assert.ok(authenticated < entitlements);
  assert.ok(entitlements < capability);
  assert.ok(capability < configured);
  assert.ok(capability < rateLimit);
  assert.ok(capability < formData);
  assert.ok(capability < provider);
  assert.match(route, /error: "PRO_REQUIRED"/);
  assert.match(route, /feature: "nutrition_ai_scan"/);
  assert.match(route, /status: 403/);
});

test("Nutrition Barcode is Pro-gated before lookup or provider access", async () => {
  const route = await source("app/api/nutrition/foods/barcode/[barcode]/route.ts");
  const authenticated = route.indexOf("getAuthenticatedUserId()");
  const entitlements = route.indexOf("getUserEntitlements(userId)");
  const capability = route.indexOf("canUseNutritionBarcodeScan(entitlements)");
  const normalized = route.indexOf("normalizeBarcode(");
  const localLookup = route.indexOf("prisma.food.findUnique");
  const providerLookup = route.indexOf("getOpenFoodFactsProduct(barcode)");

  assert.ok(authenticated >= 0);
  assert.ok(authenticated < entitlements);
  assert.ok(entitlements < capability);
  assert.ok(capability < normalized);
  assert.ok(capability < localLookup);
  assert.ok(capability < providerLookup);
  assert.match(route, /feature: "nutrition_barcode_scan"/);
  assert.match(route, /status: 403/);
});

test("only AI Scan and Barcode are represented as Nutrition Pro capabilities", async () => {
  const entitlements = await source("lib/entitlements.ts");

  assert.match(entitlements, /function canUseNutritionAiScan/);
  assert.match(entitlements, /function canUseNutritionBarcodeScan/);
  assert.match(entitlements, /return entitlements\.isPro/);
});

test("Free users see locked discovery actions while Describe and ordinary food flows stay free", async () => {
  const [quickActions, tracker, page] = await Promise.all([
    source("components/nutrition/NutritionQuickActions.tsx"),
    source("components/nutrition/NutritionTracker.tsx"),
    source("app/nutrition/page.tsx"),
  ]);

  assert.match(page, /getUserEntitlements\(session\.user\.id\)/);
  assert.match(page, /canUseNutritionAiScan\(entitlements\)/);
  assert.match(page, /canUseNutritionBarcodeScan\(entitlements\)/);
  assert.match(tracker, /quickActionCapabilities/);
  assert.match(quickActions, /Barcode, Pro feature/);
  assert.match(quickActions, /AI Scan, Pro feature/);
  assert.match(quickActions, />PRO<\/Badge>/);
  assert.match(quickActions, /feature !== "describe" && isLocked\(feature\)/);
  assert.match(quickActions, /onClick=\{\(\) => open\("describe"\)\}/);
  assert.match(quickActions, /href="\/pro"/);
  assert.match(quickActions, /DescribeWorkflow/);
  assert.match(quickActions, /searchCanonical\(query\.trim\(\)\)/);
});
