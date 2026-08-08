import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quickActionsUrl = new URL(
  "../components/nutrition/NutritionQuickActions.tsx",
  import.meta.url
);

test("barcode supports manual digits and local photo decoding without an AI upload", async () => {
  const source = await readFile(quickActionsUrl, "utf8");

  assert.match(source, /Enter manually/);
  assert.match(source, /Barcode number/);
  assert.match(source, /replaceAll\(\/\\D\/g, ""\)/);
  assert.match(source, /\^\\d\{8,14\}\$/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /Choose photo/);
  assert.match(source, /globalThis[\s\S]*BarcodeDetector/);
  assert.match(source, /ean_13/);
  assert.match(source, /ean_8/);
  assert.match(source, /upc_a/);
  assert.match(source, /upc_e/);
  assert.match(source, /@zxing\/browser/);

  const barcodeWorkflow = source.slice(
    source.indexOf("function BarcodeWorkflow"),
    source.indexOf("function FoodAmountCard")
  );
  assert.doesNotMatch(barcodeWorkflow, /\/api\/nutrition\/ai-scan/);
});

test("manual and photo barcodes share the local-first canonical lookup flow", async () => {
  const [source, route] = await Promise.all([
    readFile(quickActionsUrl, "utf8"),
    readFile(
      new URL(
        "../app/api/nutrition/foods/barcode/[barcode]/route.ts",
        import.meta.url
      ),
      "utf8"
    ),
  ]);

  assert.match(source, /await lookup\(values\[0\]\)/);
  assert.match(source, /\/api\/nutrition\/foods\/barcode\/\$\{barcode\}/);
  assert.match(source, /data\.local \?\? data\.external/);
  assert.match(route, /prisma\.food\.findUnique/);
  assert.match(route, /getOpenFoodFactsProduct\(barcode\)/);
  assert.ok(
    route.indexOf("prisma.food.findUnique") <
      route.indexOf("getOpenFoodFactsProduct(barcode)")
  );
  assert.match(source, /Add to \{mealLabel\(meal\)\}/);
  assert.match(source, /No supported barcode was detected/);
  assert.match(source, /Choose a detected barcode/);
  assert.match(source, /We couldn't find a food for this barcode/);
});

test("barcode photos are temporary and do not use a persistence endpoint", async () => {
  const source = await readFile(quickActionsUrl, "utf8");
  const scanner = source.slice(
    source.indexOf("export async function detectBarcodesFromImage"),
    source.indexOf("export function NutritionQuickActions")
  );

  assert.match(scanner, /URL\.createObjectURL/);
  assert.match(scanner, /URL\.revokeObjectURL/);
  assert.doesNotMatch(scanner, /fetch\(/);
  assert.doesNotMatch(scanner, /FormData/);
});
