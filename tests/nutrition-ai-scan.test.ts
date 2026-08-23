import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aiMealScanJsonSchema,
  aiMealScanResultSchema,
} from "../lib/nutrition/ai-scan";
import { analyzeNutritionImage } from "../lib/nutrition/ai-provider";
import { nutritionFoodIntent } from "../lib/nutrition/food-intent";
import {
  rankAiMealFoodCandidates,
  selectAiMealFoodCandidate,
} from "../lib/nutrition/ai-meal-food-matching";
import {
  rankNutritionFoodCandidates,
  selectNutritionFoodCandidate,
} from "../lib/nutrition/search-ranking";

test("AI scan accepts only bounded structured identification and amount output", () => {
  const parsed = aiMealScanResultSchema.parse({
    foods: [
      {
        label: "Egg, whole",
        preparation: "cooked",
        speciesOrVariant: null,
        estimatedGrams: 100,
        quantityText: null,
        visualConfidence: 0.92,
        specificityConfidence: 0.92,
      },
    ],
    notes: [],
  });
  assert.equal(parsed.foods[0]?.estimatedGrams, 100);
  assert.deepEqual(aiMealScanJsonSchema.required, ["foods", "notes"]);

  assert.equal(
    aiMealScanResultSchema.safeParse({
      foods: [{ label: "Egg", preparation: null, speciesOrVariant: null, estimatedGrams: -1, quantityText: null, visualConfidence: 2, specificityConfidence: 2 }],
      notes: [],
    }).success,
    false
  );
  assert.equal(
    aiMealScanResultSchema.safeParse({
      foods: [{ label: "Egg", preparation: null, speciesOrVariant: null, estimatedGrams: null, quantityText: null, calories: 90, visualConfidence: 0.8, specificityConfidence: 0.8 }],
      notes: [],
    }).success,
    false
  );
});

test("AI server validates ephemeral images and uses provider structured output", async () => {
  const [route, provider] = await Promise.all([
    readFile(
      new URL("../app/api/nutrition/ai-scan/route.ts", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../lib/nutrition/ai-provider.ts", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(route, /getAuthenticatedUserId/);
  assert.match(route, /4 \* 1024 \* 1024/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /image\/png/);
  assert.match(route, /image\/webp/);
  assert.match(route, /description\.length > 200/);
  assert.match(route, /reserveNutritionAiQuota\(userId, true, "aiScan"\)/);
  assert.match(route, /releaseNutritionAiQuota\(reservation\)/);
  assert.match(route, /resolveDescribedFoods/);
  assert.match(route, /\{ aiMealPhoto: true \}/);
  assert.match(route, /resolved review foods/);
  assert.match(route, /DAILY_LIMIT_REACHED/);
  assert.doesNotMatch(route, /prisma/);

  assert.match(provider, /process\.env\.OPENAI_API_KEY/);
  assert.match(provider, /OPENAI_NUTRITION_MODEL/);
  assert.match(provider, /store: false/);
  assert.match(provider, /type: "json_schema"/);
  assert.match(provider, /aiMealScanResultSchema\.safeParse/);
  assert.match(provider, /Do not return nutrition values/);
  assert.match(provider, /supplemental context/);
  assert.match(provider, /detail: "high"/);
  assert.match(provider, /raw vision response/);
});

test("AI provider sends an ephemeral image and accepts only its validated structured result", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_NUTRITION_MODEL;
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_NUTRITION_MODEL = "test-vision-model";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  foods: [
                    {
                      label: "Avocado",
                      preparation: null,
                      speciesOrVariant: null,
                      estimatedGrams: 75,
                      quantityText: null,
                      visualConfidence: 0.8,
                      specificityConfidence: 0.8,
                    },
                  ],
                  notes: [],
                }),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await analyzeNutritionImage(
      Buffer.from([0x52, 0x49, 0x46, 0x46]),
      "image/webp",
      "half an avocado"
    );
    assert.equal(result.foods[0]?.label, "Avocado");
    const captured = requestBody as unknown as Record<string, unknown>;
    assert.equal(captured.model, "test-vision-model");
    assert.equal(captured.store, false);
    assert.deepEqual(
      (captured.text as { format: { type: string } }).format.type,
      "json_schema"
    );
    const requestJson = JSON.stringify(captured);
    assert.match(requestJson, /data:image\/webp;base64/);
    assert.match(requestJson, /half an avocado/);
    assert.doesNotMatch(requestJson, /caloriesKcal/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_NUTRITION_MODEL;
    else process.env.OPENAI_NUTRITION_MODEL = originalModel;
  }
});

test("AI UI compresses a temporary photo and requires canonical review before batch logging", async () => {
  const source = await readFile(
    new URL(
      "../components/nutrition/NutritionQuickActions.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const workflow = source.slice(
    source.indexOf("function AiWorkflow"),
    source.indexOf("function DescribeWorkflow")
  );

  assert.match(workflow, /compressWorkoutPhoto\(image\)/);
  assert.match(workflow, /form\.set\("description", description\)/);
  assert.match(workflow, /\/api\/nutrition\/ai-scan/);
  assert.match(workflow, /detected\.food\?\.id/);
  assert.match(workflow, /suggestion\.candidates/);
  assert.doesNotMatch(workflow, /Choose matching foods manually/);
  assert.doesNotMatch(workflow, /resolveCanonicalFood\(detected\.label\)/);
  assert.match(workflow, /ReviewList/);
  assert.match(source, /Replace/);
  assert.match(workflow, /Remove image/);
  assert.match(workflow, /AI estimates can be\s+inaccurate/);
  assert.ok(
    workflow.indexOf("await batchLog") > workflow.indexOf("async function confirm")
  );
});

test("AI Scan intent aliases and shared ranking resolve ingredients rather than derivatives", () => {
  assert.deepEqual(nutritionFoodIntent("manatarka"), {
    rankQuery: "porcini mushroom",
    searchQueries: ["manatarka", "porcini mushroom", "porcini", "mushroom"],
    canonicalName: "Porcini mushroom",
  });
  assert.deepEqual(nutritionFoodIntent("French omelette"), {
    rankQuery: "omelet",
    searchQueries: ["french omelette", "omelet", "omelette", "egg omelet", "egg"],
    canonicalName: "Omelet",
  });

  const candidates = [
    { name: "Peanut butter", provider: "USDA" as const, type: "GENERIC" },
    { name: "Butter, salted", provider: "USDA" as const, type: "GENERIC" },
    { name: "Butter", provider: "USDA" as const, type: "GENERIC" },
  ];
  const ranked = rankNutritionFoodCandidates("butter", candidates);
  assert.equal(ranked[0]?.name, "Butter");
  assert.equal(selectNutritionFoodCandidate("butter", ranked)?.name, "Butter");
});

test("omelette, porcini, and butter ingredient intents resolve to safe generic foods", () => {
  const candidate = (name: string) => ({ name, provider: "USDA" as const, type: "GENERIC" });
  assert.equal(
    selectNutritionFoodCandidate(nutritionFoodIntent("French omelette").rankQuery, [candidate("Egg omelet, plain")])?.name,
    "Egg omelet, plain"
  );
  assert.equal(
    selectNutritionFoodCandidate(nutritionFoodIntent("manatarka").rankQuery, [candidate("Mushrooms, porcini")])?.name,
    "Mushrooms, porcini"
  );
  assert.equal(
    selectNutritionFoodCandidate(nutritionFoodIntent("butter").rankQuery, [candidate("Butter"), candidate("Peanut butter")])?.name,
    "Butter"
  );
});

test("AI common-food intents normalize presentation and resolve visible canonical foods", () => {
  const generic = (name: string) => ({
    id: `food-${name}`,
    name,
    provider: "USDA" as const,
    type: "GENERIC",
    isLocal: true,
  });
  const branded = (name: string, brandName: string) => ({
    id: `food-${name}`,
    name,
    brandName,
    provider: "OPEN_FOOD_FACTS" as const,
    type: "BRANDED",
    isLocal: true,
  });

  assert.deepEqual(nutritionFoodIntent("Roasted Potatoes"), {
    rankQuery: "potatoes",
    searchQueries: ["roasted potatoes", "potatoes"],
    canonicalName: "Potatoes",
  });
  assert.deepEqual(nutritionFoodIntent("salmon fillet"), {
    rankQuery: "salmon",
    searchQueries: ["salmon fillet", "salmon"],
    canonicalName: "Salmon",
  });
  assert.equal(nutritionFoodIntent("smoked salmon").rankQuery, "smoked salmon");

  for (const [detected, canonical] of [
    ["Salmon", "Salmon"],
    ["Potatoes", "Potato"],
    ["Potato", "Potato"],
    ["Rice", "Rice"],
    ["Chicken breast", "Chicken breast"],
    ["Banana", "Banana"],
    ["Eggs", "Egg"],
  ] as const) {
    assert.equal(
      selectNutritionFoodCandidate(
        nutritionFoodIntent(detected).rankQuery,
        [generic(canonical)]
      )?.name,
      canonical
    );
  }

  assert.equal(
    selectNutritionFoodCandidate("salmon", [
      branded("Ocean Kiss Salmon", "Ocean Kiss"),
      generic("Salmon"),
    ])?.name,
    "Salmon"
  );
  assert.equal(
    selectNutritionFoodCandidate("philadelphia cream cheese", [
      generic("Cream cheese"),
      branded("Philadelphia Cream Cheese", "Philadelphia"),
    ])?.name,
    "Philadelphia Cream Cheese"
  );
  assert.equal(
    selectNutritionFoodCandidate("smoked salmon", [generic("Salmon")]),
    null
  );
  assert.equal(
    selectNutritionFoodCandidate("unlisted moonfruit", [generic("Banana")]),
    null
  );
});

test("AI photo matching prefers plain foods and preserves explicit dish or brand intent", () => {
  const generic = (name: string) => ({
    id: `generic-${name}`,
    name,
    provider: "USDA" as const,
    type: "GENERIC",
    isLocal: true,
  });
  const branded = (name: string, brandName: string) => ({
    id: `branded-${name}`,
    name,
    brandName,
    provider: "OPEN_FOOD_FACTS" as const,
    type: "BRANDED",
    isLocal: true,
  });

  assert.equal(
    selectAiMealFoodCandidate("salmon", "salmon", [
      generic("Salmon salad"),
      generic("Salmon"),
    ])?.name,
    "Salmon"
  );
  assert.equal(
    selectAiMealFoodCandidate("salmon fillet", "salmon", [
      generic("Salmon salad"),
      generic("Smoked salmon spread"),
      generic("Salmon, cooked"),
      generic("Salmon"),
    ])?.name,
    "Salmon"
  );
  assert.deepEqual(
    rankAiMealFoodCandidates("potatoes", "potatoes", [
      generic("Potato salad"),
      generic("Potato, cooked, as ingredient"),
      generic("Potato, cooked"),
    ]).map((candidate) => candidate.name),
    ["Potato, cooked", "Potato, cooked, as ingredient", "Potato salad"]
  );
  assert.equal(
    selectAiMealFoodCandidate("salmon salad", "salmon salad", [
      generic("Salmon"),
      generic("Salmon salad"),
    ])?.name,
    "Salmon salad"
  );
  assert.equal(
    selectAiMealFoodCandidate("Ocean Kiss salmon", "ocean kiss salmon", [
      generic("Salmon"),
      branded("Ocean Kiss Salmon", "Ocean Kiss"),
    ])?.name,
    "Ocean Kiss Salmon"
  );
  assert.deepEqual(
    rankAiMealFoodCandidates("grilled salmon", "salmon", [
      generic("Salmon salad"),
      generic("Salmon, raw"),
      generic("Salmon"),
      generic("Salmon, cooked"),
      generic("Salmon, grilled"),
    ]).map((candidate) => candidate.name),
    ["Salmon, grilled", "Salmon, cooked", "Salmon", "Salmon, raw", "Salmon salad"]
  );
  assert.equal(
    selectAiMealFoodCandidate("unlisted moonfruit", "unlisted moonfruit", [generic("Banana")]),
    null
  );
});

test("AI ready-to-add review preserves estimated grams and does not create a duplicate", async () => {
  const [workflow, resolver, service, visibility] = await Promise.all([
    readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/describe-resolver.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/food-visibility.ts", import.meta.url), "utf8"),
  ]);
  const aiWorkflow = workflow.slice(
    workflow.indexOf("function AiWorkflow"),
    workflow.indexOf("function DescribeWorkflow")
  );

  assert.match(aiWorkflow, /if \(detected\.estimatedGrams && detected\.estimatedGrams > 0\)[\s\S]*return detected\.estimatedGrams/);
  assert.match(aiWorkflow, /if \(!detected\.food\?\.id\)[\s\S]*unresolved\.push/);
  assert.match(aiWorkflow, /const food = detected\.food[\s\S]*resolved\.push/);
  assert.match(resolver, /if \("id" in candidate && candidate\.id\) return candidate/);
  assert.match(service, /intent\.searchQueries\.map\(\(intentQuery\) => searchLocalFoods\(intentQuery, userId\)\)/);
  assert.match(service, /isCanonicalAiMealFoodCandidate\(query, intent\.rankQuery, localMatch\)/);
  assert.match(visibility, /contributionStatus: FoodContributionStatus\.PENDING, createdByUserId: userId/);
});

test("vision preserves dish identity and separates uncertain mushroom species", () => {
  const parsed = aiMealScanResultSchema.parse({
    foods: [
      { label: "omelette", preparation: "French-style", speciesOrVariant: null, estimatedGrams: null, quantityText: null, visualConfidence: 0.95, specificityConfidence: 0.85 },
      { label: "mushroom", preparation: "cooked", speciesOrVariant: "porcini", estimatedGrams: null, quantityText: null, visualConfidence: 0.95, specificityConfidence: 0.55 },
    ],
    notes: [],
  });
  assert.equal(parsed.foods[0]?.label, "omelette");
  assert.equal(parsed.foods[1]?.label, "mushroom");
  assert.equal(parsed.foods[1]?.speciesOrVariant, "porcini");
  assert.equal(parsed.foods[1]?.specificityConfidence, 0.55);
});
