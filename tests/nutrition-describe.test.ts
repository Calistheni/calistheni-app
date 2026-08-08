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

  assert.match(source, /type DescribeState/);
  assert.match(workflow, /useState<DescribeState>/);
  assert.match(workflow, /Describe your meal/);
  assert.match(workflow, /Review meal/);
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
  assert.match(workflow, /Needs review · No matching food selected/);
  assert.match(workflow, /Choose matching food/);
  assert.match(workflow, /Choose a matching food or remove every item/);
  assert.match(workflow, /batchLog\(meal, date, resolvedItems\)/);
  assert.match(workflow, /Add \{resolvedItems\.length\}[\s\S]*to \{mealLabel\(meal\)\}/);
  assert.match(workflow, /Add foods manually/);
  assert.doesNotMatch(workflow, /\/api\/nutrition\/ai-scan/);
  assert.match(route, /getAuthenticatedUserId/);
  assert.doesNotMatch(route, /canUseNutritionAiScan/);
  assert.match(route, /consumeNutritionAiRateLimit/);
  assert.match(route, /describeNutritionMeal/);
  assert.match(schema, /estimatedGrams/);
  assert.doesNotMatch(schema, /caloriesKcal/);
  assert.match(provider, /OPENAI_NUTRITION_DESCRIBE_MODEL/);
  assert.match(provider, /Do not return calories, macros/);
  assert.match(schema, /required: \["label", "preparation", "estimatedGrams", "quantityText"\]/);
  assert.match(schema, /anyOf: \[\{ type: "string" \}, \{ type: "null" \}\]/);
});

test("Describe provider uses strict compatible output and keeps valid foods when another item is malformed", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  const requestBodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ foods: [
      { label: "salmon", preparation: "cooked", estimatedGrams: null, quantityText: null },
      { label: 42, preparation: null, estimatedGrams: null, quantityText: null },
      { label: "potatoes", preparation: "boiled", estimatedGrams: 100, quantityText: "100 g" },
    ] }) }] }] }), { status: 200 });
  };
  try {
    const { describeNutritionMeal } = await import("../lib/nutrition/ai-provider.ts");
    const result = await describeNutritionMeal("salmon with potatoes");
    assert.deepEqual(result.foods.map((food) => food.label), ["salmon", "potatoes"]);
    const format = (requestBodies[0]?.text as { format?: { schema?: { properties?: { foods?: { items?: { required?: string[] } } } } } } | undefined)?.format;
    assert.deepEqual(format?.schema?.properties?.foods?.items?.required, ["label", "preparation", "estimatedGrams", "quantityText"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
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

test("Describe review exposes explicit edit, replace, remove, and manual add controls", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8");
  const reviewList = source.slice(source.indexOf("function ReviewList"), source.indexOf("function MealTotal"));
  assert.match(source, /\{editing \? "Done" : "Edit"\}/);
  assert.match(reviewList, /Replace/);
  assert.match(source, /aria-label=\{`Remove \$\{food\.name\}`\}/);
});
