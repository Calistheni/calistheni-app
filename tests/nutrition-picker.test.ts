import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deduplicateFoodResults, foodResultKey } from "../lib/nutrition/result-identity";

test("food-picker identities keep provider collisions distinct but remove exact duplicates", () => {
  const usda = { provider: "USDA", externalId: "2709294" };
  const off = { provider: "OPEN_FOOD_FACTS", externalId: "2709294" };
  assert.notEqual(foodResultKey(usda), foodResultKey(off));
  assert.deepEqual(deduplicateFoodResults([usda, usda, off]), [usda, off]);
  assert.equal(foodResultKey({ id: "food_1", externalId: "2709294", source: "USDA" }), "local:food_1");
});

test("picker reuses FoodVisual and a compact source-aware food row", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8");
  assert.match(source, /<FoodVisual imageUrl=\{food\.imageUrl\} iconPath=\{food\.genericIcon\?\.url\}/);
  assert.match(source, /key=\{foodResultKey\(food\)\}/);
  assert.match(source, /deduplicateFoodResults/);
  assert.match(source, /min-w-0 items-center gap-3/);
  assert.match(source, /line-clamp-2/);
});

test("picker uses accessible Radix tabs with one value-bound content panel per section", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8");
  const tabs = await readFile(new URL("../components/ui/tabs.tsx", import.meta.url), "utf8");
  assert.match(source, /<Tabs defaultValue="food">/);
  assert.match(source, /<TabsTrigger className="flex-1" value="food">Food/);
  assert.match(source, /<TabsContent value="food"/);
  assert.match(source, /<TabsContent value="meals">/);
  assert.match(source, /<TabsContent value="recipes">/);
  assert.match(tabs, /TabsPrimitive\.Root/);
  assert.match(tabs, /data-\[state=active\]:bg-background/);
  assert.match(tabs, /min-w-0 flex-1/);
});

test("nutrition rows reuse FoodVisual, and explicit menu actions separate edit from removal", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8");
  assert.match(source, /foodVisual\?\.imageUrl/);
  assert.match(source, /DropdownMenuTrigger asChild/);
  assert.match(source, /Actions for \$\{e\.foodNameSnapshot\}/);
  assert.match(source, /DropdownMenuItem onSelect=\{\(\)=>onEdit\(e\)\}>Edit/);
  assert.match(source, /variant="destructive" onSelect=\{\(\)=>onDelete\(e\.id\)\}>Remove/);
  assert.match(source, /key=\{pickerKey\} meal=\{meal\}/);
  assert.match(source, /function dismiss\(\)\{setQuery\(""\);setFoods\(\[\]\);setSelected\(null\);setGrams\("100"\);close\(\)\}/);
});

test("daily GET, create, and edit all use the canonical entry serializer", async () => {
  const [daily, mutation, serializer] = await Promise.all([
    readFile(new URL("../app/api/user/nutrition/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/user/nutrition/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/entry-serializer.ts", import.meta.url), "utf8"),
  ]);
  assert.match(daily, /entries\.map\(serializeNutritionEntry\)/);
  assert.match(daily, /NextResponse\.json\(serializeNutritionEntry\(entry\), \{ status: 201 \}\)/);
  assert.match(mutation, /NextResponse\.json\(serializeNutritionEntry\(updated\)\)/);
  assert.match(serializer, /foodVisual: toFoodSummary\(food\)/);
});
