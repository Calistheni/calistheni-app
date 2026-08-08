import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NUTRITION_AI_LIMITS, nutritionAiDailyLimit } from "../lib/nutrition/ai-limits.ts";

test("central Nutrition AI limits keep Describe free and AI Scan Pro-only", () => {
  assert.deepEqual(NUTRITION_AI_LIMITS, {
    FREE: { describePerDay: 10 },
    PRO: { describePerDay: 200, aiScanPerDay: 100 },
  });
  assert.equal(nutritionAiDailyLimit("describe", false), 10);
  assert.equal(nutritionAiDailyLimit("describe", true), 200);
  assert.equal(nutritionAiDailyLimit("aiScan", true), 100);
});

test("daily usage is one UTC aggregate row with atomic reservation and failure release", async () => {
  const [schema, migration, quota] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20260809143000_add_nutrition_ai_usage/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/ai-quota.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /model NutritionAiUsage/);
  assert.match(schema, /@@unique\(\[userId, date\]\)/);
  assert.match(schema, /describeCount Int +@default\(0\)/);
  assert.match(schema, /aiScanCount +Int +@default\(0\)/);
  assert.match(migration, /"date" DATE NOT NULL/);
  assert.match(quota, /Date\.UTC/);
  assert.match(quota, /TransactionIsolationLevel\.Serializable/);
  assert.match(quota, /increment: 1/);
  assert.match(quota, /releaseNutritionAiQuota/);
  assert.match(quota, /decrement: 1/);
});

test("AI routes validate before quota use, return structured daily-limit errors, and release failed model calls", async () => {
  const [describe, scan, limits] = await Promise.all([
    readFile(new URL("../app/api/nutrition/describe/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/nutrition/ai-scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/user/nutrition/ai-limits/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(describe, /max\(250\)/);
  assert.match(describe, /reserveNutritionAiQuota/);
  assert.match(describe, /DAILY_LIMIT_REACHED/);
  assert.match(describe, /feature: "nutrition_describe"/);
  assert.match(describe, /releaseNutritionAiQuota\(reservation\)/);
  assert.match(scan, /canUseNutritionAiScan/);
  assert.match(scan, /reserveNutritionAiQuota/);
  assert.match(scan, /feature: "nutrition_ai_scan"/);
  assert.match(scan, /releaseNutritionAiQuota\(reservation\)/);
  assert.match(limits, /getNutritionAiQuotas/);
  assert.match(limits, /isPro: entitlements\.isPro/);
});

test("quota UI shows server-derived counts, a 250-character counter, and plan-aware limit dialogs", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/user\/nutrition\/ai-limits/);
  assert.match(source, /maxLength=\{250\}/);
  assert.match(source, /description\.length >= 220/);
  assert.match(source, /\{description\.length\} \/ 250/);
  assert.match(source, /DAILY_LIMIT_REACHED/);
  assert.match(source, /Upgrade to Pro for 200 AI descriptions per day/);
  assert.match(source, /Your quota resets tomorrow/);
});
