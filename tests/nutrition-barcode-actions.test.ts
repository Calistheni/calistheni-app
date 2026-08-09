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

test("native Barcode opens a continuous rear-camera scanner and locks the first valid result", async () => {
  const [workflow, nativeScanner, manifest] = await Promise.all([
    readFile(quickActionsUrl, "utf8"),
    readFile(new URL("../lib/native/barcode-scanner.ts", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /canUseNativeLiveBarcodeScanner/);
  assert.match(workflow, /getNativeBarcodeScannerAvailability/);
  assert.match(workflow, /const allowPhotoFallback\s*=\s*!nativeRuntime/);
  assert.match(workflow, /startNativeLiveBarcodeScanner/);
  assert.match(workflow, /scanLocked\.current/);
  assert.match(workflow, /stopNativeLiveBarcodeScanner/);
  assert.match(workflow, /signalNativeBarcodeSuccess/);
  assert.match(workflow, /Barcode found/);
  assert.match(workflow, /Looking up product/);
  assert.match(workflow, /Add to \{mealLabel\(meal\)\}/);
  assert.match(workflow, /Cancel/);
  assert.match(workflow, /Align the barcode inside the frame/);
  assert.match(workflow, /Toggle flash/);
  assert.match(workflow, /Open Settings/);
  assert.match(nativeScanner, /LensFacing\.Back/);
  assert.match(nativeScanner, /BarcodeFormat\.Ean13/);
  assert.match(nativeScanner, /BarcodeFormat\.Ean8/);
  assert.match(nativeScanner, /BarcodeFormat\.UpcA/);
  assert.match(nativeScanner, /BarcodeFormat\.UpcE/);
  assert.match(nativeScanner, /BarcodeFormat\.Code128/);
  assert.match(nativeScanner, /BarcodeFormat\.Code39/);
  assert.match(nativeScanner, /BarcodeFormat\.Itf/);
  assert.match(nativeScanner, /barcodesScanned/);
  assert.match(nativeScanner, /Haptics\.impact/);
  assert.match(nativeScanner, /native-barcode-scanner-active/);
  assert.match(nativeScanner, /Capacitor\.isPluginAvailable/);
  assert.match(nativeScanner, /NutritionBarcodeScanner/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /com\.google\.mlkit\.vision\.DEPENDENCIES/);
});

test("a native bridge failure remains an explicit scanner error instead of silently opening manual entry", async () => {
  const [workflow, nativeScanner] = await Promise.all([
    readFile(quickActionsUrl, "utf8"),
    readFile(new URL("../lib/native/barcode-scanner.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workflow, /const showNativeStartupError\s*=/);
  assert.match(workflow, /!nativeRuntime/);
  assert.match(workflow, /Live barcode scanner failed to start/);
  assert.match(workflow, /This installed app does not include the native live barcode scanner/);
  assert.match(workflow, /endNativeScannerSession\("manual-entry"\);[\s\S]*setManualMode\(true\)/);
  assert.doesNotMatch(
    workflow,
    /setManualMode\(true\);\s*setError\(\s*"Live barcode scanning is unavailable/
  );
  assert.match(nativeScanner, /\[BarcodeScanner\]/);
  assert.match(nativeScanner, /pluginAvailable/);
  assert.match(nativeScanner, /startScan called/);
  assert.match(nativeScanner, /permission checked/);
});

test("native scanner lifetime is independent of startup state updates and stops only for a real session end", async () => {
  const [workflow, nativeScanner, iosPlugin] = await Promise.all([
    readFile(quickActionsUrl, "utf8"),
    readFile(new URL("../lib/native/barcode-scanner.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../ios/App/App/NutritionBarcodeScannerPlugin.swift", import.meta.url),
      "utf8"
    ),
  ]);
  const barcodeWorkflow = workflow.slice(
    workflow.indexOf("function BarcodeWorkflow"),
    workflow.indexOf("function FoodAmountCard")
  );

  assert.match(barcodeWorkflow, /scannerSessionRef/);
  assert.match(barcodeWorkflow, /scannerActiveRef/);
  assert.match(barcodeWorkflow, /scannerSessionVersion/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("barcode-detected"\)/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("manual-entry"\)/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("app-background"\)/);
  assert.match(barcodeWorkflow, /App\.addListener\("pause"/);
  assert.doesNotMatch(barcodeWorkflow, /App\.addListener\("appStateChange"/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("scanner-session-cleanup"\)/);
  assert.match(barcodeWorkflow, /\[open, nativeRuntime, scannerSessionVersion, endNativeScannerSession\]/);
  assert.doesNotMatch(
    barcodeWorkflow,
    /\[open, food, error, manualMode, nativeScanner, nativeRuntime\]/
  );
  assert.match(nativeScanner, /startAttempt/);
  assert.match(nativeScanner, /AbortSignal/);
  assert.match(nativeScanner, /stop requested/);
  assert.match(iosPlugin, /sessionQueue/);
  assert.match(iosPlugin, /sessionQueue startRunning begin/);
  assert.match(iosPlugin, /sessionQueue stopRunning/);
  assert.match(iosPlugin, /preview layer attached/);
  assert.match(iosPlugin, /previewContainer/);
  assert.match(iosPlugin, /systemPink/);
  assert.match(iosPlugin, /AVCaptureSessionRuntimeError/);
  assert.match(iosPlugin, /AVCaptureSessionWasInterrupted/);
});
