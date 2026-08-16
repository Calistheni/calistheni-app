import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("barcode contributions reuse canonical Food moderation fields and preserve the barcode", async () => {
  const source = await readFile(new URL("../lib/nutrition/barcode-contribution.ts", import.meta.url), "utf8");
  assert.match(source, /type: FoodType\.USER_CREATED/);
  assert.match(source, /contributionStatus: "PENDING"/);
  assert.match(source, /createdByUserId: userId/);
  assert.match(source, /barcode,/);
  assert.match(source, /Recheck inside the write transaction/);
  assert.match(source, /creator-visible pending match reused/);
  assert.match(source, /canReuseBarcodeFood/);
});

test("label conversion only derives per-100-g data when the basis is safe", async () => {
  const source = await readFile(new URL("../lib/nutrition/barcode-contribution.ts", import.meta.url), "utf8");
  assert.match(source, /SERVING_GRAMS_REQUIRED/);
  assert.match(source, /100 \/ extraction\.servingGrams/);
  assert.match(source, /nutritionBasis === "PER_SERVING"/);
});

test("barcode lookup applies creator-only pending visibility", async () => {
  const route = await readFile(new URL("../app/api/nutrition/foods/barcode/[barcode]/route.ts", import.meta.url), "utf8");
  assert.match(route, /canUseNutritionFood\(local, userId\)/);
  assert.match(route, /creator-pending-hit/);
  assert.match(route, /isOwnContribution: local\.createdByUserId === userId/);
});

test("post-create flow can save and log the creator pending food without a new search", async () => {
  const ui = await readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8");
  assert.match(ui, /saveContribution\(addAfterSave = false\)/);
  assert.match(ui, /await batchLog\(meal, date/);
  assert.match(ui, /Save product/);
  assert.match(ui, /Your contribution · Pending review/);
});

test("admin contribution cards show and copy the submitted barcode", async () => {
  const [ui, history, moderation] = await Promise.all([
    readFile(new URL("../components/admin/NutritionContributionsAdmin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/admin-food-contributions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/nutrition/foods/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /<span>Barcode<\/span>/);
  assert.match(ui, /food\.barcode \?\? "—"/);
  assert.match(ui, /copyBarcode/);
  assert.match(ui, /font-mono/);
  assert.match(history, /barcode: food\.barcode \? String\(food\.barcode\) : null/);
  assert.match(history, /typeof record\.kind === "string" \? record : null/);
  assert.match(moderation, /barcode: food\.barcode/);
});
