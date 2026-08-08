import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Describe parses natural language, resolves canonical foods, and keeps review editable", async () => {
  const [source, route, schema, provider] = await Promise.all([
    readFile(
    new URL(
      "../components/nutrition/NutritionQuickActions.tsx",
      import.meta.url
    ),
    "utf8"),
    readFile(new URL("../app/api/nutrition/describe/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/describe.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/ai-provider.ts", import.meta.url), "utf8"),
  ]);
  const workflow = source.slice(
    source.indexOf("function DescribeWorkflow"),
    source.indexOf("function DraftSearch")
  );

  assert.match(workflow, /useState<DraftItem\[\]>\(\[\]\)/);
  assert.match(workflow, /Describe your meal/);
  assert.match(workflow, /Describe what you ate/);
  assert.match(workflow, /salmon with potatoes/);
  assert.match(workflow, /onSubmit/);
  assert.match(workflow, /\/api\/nutrition\/describe/);
  assert.match(workflow, /\[detected\.preparation, detected\.label\]/);
  assert.match(workflow, /searchCanonical\(query\)/);
  assert.match(workflow, /detected\.estimatedGrams \?\? serving\?\.grams \?\? 100/);
  assert.match(workflow, /quantityHint/);
  assert.match(workflow, /DraftSearch/);
  assert.match(workflow, /ReviewList/);
  assert.match(workflow, /MealTotal/);
  assert.match(workflow, /setItems\(\[\]\)/);
  assert.match(workflow, /batchLog\(meal, date, items\)/);
  assert.match(workflow, /Add \{items\.length\}[\s\S]*to \{mealLabel\(meal\)\}/);
  assert.doesNotMatch(workflow, /\/api\/nutrition\/ai-scan/);
  assert.match(route, /getAuthenticatedUserId/);
  assert.doesNotMatch(route, /canUseNutritionAiScan/);
  assert.match(route, /consumeNutritionAiRateLimit/);
  assert.match(route, /describeNutritionMeal/);
  assert.match(schema, /estimatedGrams/);
  assert.doesNotMatch(schema, /caloriesKcal/);
  assert.match(provider, /OPENAI_NUTRITION_DESCRIBE_MODEL/);
  assert.match(provider, /Do not return calories, macros/);
});

test("manual and AI drafts share all-or-nothing canonical snapshot creation", async () => {
  const route = await readFile(
    new URL(
      "../app/api/nutrition/entries/batch/route.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(route, /getAuthenticatedUserId/);
  assert.match(route, /items: z\.array\(itemSchema\)\.min\(1\)\.max\(20\)/);
  assert.match(route, /z\.number\(\)\.finite\(\)\.positive\(\)/);
  assert.match(route, /foods\.length !== ids\.length/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /snapshotForFood/);
  assert.match(route, /serializeNutritionEntry/);
  assert.match(route, /mealCategorySchema/);
  assert.doesNotMatch(route, /userId: z\./);
});

test("confirmed batch entries feed the current meal tracker immediately", async () => {
  const tracker = await readFile(
    new URL(
      "../components/nutrition/NutritionTracker.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(tracker, /<NutritionQuickActions/);
  assert.match(tracker, /meal=\{meal!\}/);
  assert.match(tracker, /date=\{date\}/);
  assert.match(tracker, /onEntries=\{\(created\) => onAddEntries\(created as Entry\[\]\)\}/);
  assert.match(tracker, /const applyServerEntries = useCallback/);
  assert.match(tracker, /created\.forEach\(\(entry\) => byId\.set\(entry\.id, entry\)\)/);
});
