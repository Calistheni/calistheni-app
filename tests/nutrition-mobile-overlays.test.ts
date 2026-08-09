import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nutrition mobile sheet owns one scroll body and a safe-area sticky footer", async () => {
  const source = await readFile(new URL("../components/nutrition/NutritionMobileSheet.tsx", import.meta.url), "utf8");
  assert.match(source, /h-\[94dvh\]/);
  assert.match(source, /max-h-\[calc\(100dvh-env\(safe-area-inset-top\)-0\.5rem\)\]/);
  assert.match(source, /data-slot="nutrition-sheet-scroll"/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(source, /data-slot="nutrition-sheet-footer"/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /overflow-hidden p-0/);
});

test("AI Scan, Describe, Barcode, and meal sheets keep their final actions reachable", async () => {
  const [quick, meals, tracker] = await Promise.all([
    readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/nutrition/NutritionSavedMeals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal((quick.match(/<NutritionMobileSheet/g) ?? []).length, 3);
  assert.match(quick, /footer=\{items\.length \? <Button/);
  assert.match(quick, /footer=\{review && resolvedItems\.length \? <Button/);
  assert.match(quick, /Add to \{mealLabel\(meal\)\}/);
  assert.equal((meals.match(/<NutritionMobileSheet/g) ?? []).length, 2);
  assert.match(meals, /Update meal items \(\{selected\.size\}\)/);
  assert.match(meals, /max-h-\[min\(58dvh,34rem\)\].*overflow-y-auto overscroll-contain/);
  assert.match(tracker, /max-h-\[calc\(100dvh-env\(safe-area-inset-top\)-0\.5rem\)\]/);
  assert.match(tracker, /ScrollArea className="h-\[min\(48dvh,26rem\)\]/);
  assert.match(tracker, /min-h-11 w-full min-w-0/);
});

test("mobile overlays retain shadcn titles, accessible search fields, and bounded previews", async () => {
  const quick = await readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8");
  assert.match(quick, /<SheetTitle>AI food scan<\/SheetTitle>/);
  assert.match(quick, /<SheetTitle>Barcode<\/SheetTitle>/);
  assert.match(quick, /Review meal/);
  assert.match(quick, /placeholder="Search foods"/);
  assert.match(quick, /aria-label="Remove image"/);
  assert.match(quick, /relative h-\[min\(16rem,30dvh\)\] max-h-\[30dvh\] overflow-hidden rounded-xl/);
  assert.match(quick, /flex flex-wrap gap-2/);
});
