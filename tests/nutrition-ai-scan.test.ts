import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aiMealScanJsonSchema,
  aiMealScanResultSchema,
} from "../lib/nutrition/ai-scan";
import { analyzeNutritionImage } from "../lib/nutrition/ai-provider";

test("AI scan accepts only bounded structured identification and amount output", () => {
  const parsed = aiMealScanResultSchema.parse({
    foods: [
      { label: "Egg, whole", estimatedGrams: 100, confidence: 0.92 },
    ],
    notes: [],
  });
  assert.equal(parsed.foods[0]?.estimatedGrams, 100);
  assert.deepEqual(aiMealScanJsonSchema.required, ["foods", "notes"]);

  assert.equal(
    aiMealScanResultSchema.safeParse({
      foods: [{ label: "Egg", estimatedGrams: -1, confidence: 2 }],
      notes: [],
    }).success,
    false
  );
  assert.equal(
    aiMealScanResultSchema.safeParse({
      foods: [{ label: "Egg", calories: 90 }],
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
  assert.match(route, /DAILY_LIMIT_REACHED/);
  assert.doesNotMatch(route, /prisma/);

  assert.match(provider, /process\.env\.OPENAI_API_KEY/);
  assert.match(provider, /OPENAI_NUTRITION_MODEL/);
  assert.match(provider, /store: false/);
  assert.match(provider, /type: "json_schema"/);
  assert.match(provider, /aiMealScanResultSchema\.safeParse/);
  assert.match(provider, /Do not provide nutrition values/);
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
                      estimatedGrams: 75,
                      confidence: 0.8,
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
  assert.match(workflow, /resolveCanonicalFood\(detected\.label\)/);
  assert.match(workflow, /importFood\(match\)/);
  assert.match(workflow, /ReviewList/);
  assert.match(source, /Replace/);
  assert.match(workflow, /Remove image/);
  assert.match(workflow, /AI estimates can be\s+inaccurate/);
  assert.ok(
    workflow.indexOf("await batchLog") > workflow.indexOf("async function confirm")
  );
});
