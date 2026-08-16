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
  assert.match(source, /\/api\/nutrition\/foods\/barcode\/\$\{encodeURIComponent\(barcode\)\}/);
  assert.match(source, /data\.status === "not_found"/);
  assert.match(route, /prisma\.food\.findUnique/);
  assert.match(route, /getOpenFoodFactsProduct\(barcode\)/);
  assert.ok(
    route.indexOf("prisma.food.findUnique") <
      route.indexOf("getOpenFoodFactsProduct(barcode)")
  );
  assert.match(source, /Add to \{mealLabel\(meal\)\}/);
  assert.match(source, /No supported barcode was detected/);
  assert.match(source, /Choose a detected barcode/);
  assert.match(source, /Product not found/);
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
  assert.doesNotMatch(nativeScanner, /native-barcode-scanner-active/);
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

test("native iOS scanning uses a full-screen controller instead of a WebView underlay", async () => {
  const [workflow, nativeScanner, iosPlugin, scannerController] = await Promise.all([
    readFile(quickActionsUrl, "utf8"),
    readFile(new URL("../lib/native/barcode-scanner.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../ios/App/App/NutritionBarcodeScannerPlugin.swift", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../ios/App/App/BarcodeScannerViewController.swift", import.meta.url),
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
  assert.match(barcodeWorkflow, /nativeIosScanner/);
  assert.match(barcodeWorkflow, /Rendering no web Sheet here/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("barcode-detected"\)/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("manual-entry"\)/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("app-background"\)/);
  assert.match(barcodeWorkflow, /App\.addListener\("pause"/);
  assert.doesNotMatch(barcodeWorkflow, /App\.addListener\("appStateChange"/);
  assert.match(barcodeWorkflow, /endNativeScannerSession\("scanner-session-cleanup"\)/);
  assert.match(barcodeWorkflow, /open,[\s\S]*nativeRuntime,[\s\S]*nativeIosScanner,[\s\S]*scannerSessionVersion,[\s\S]*endNativeScannerSession/);
  assert.doesNotMatch(
    barcodeWorkflow,
    /\[open, food, error, manualMode, nativeScanner, nativeRuntime\]/
  );
  assert.match(nativeScanner, /startAttempt/);
  assert.match(nativeScanner, /AbortSignal/);
  assert.match(nativeScanner, /stop requested/);
  assert.match(nativeScanner, /manualRequested/);
  assert.match(nativeScanner, /scannerCancelled/);
  assert.match(iosPlugin, /modalPresentationStyle = \.fullScreen/);
  assert.match(iosPlugin, /BarcodeScannerViewController/);
  assert.match(iosPlugin, /private var activeScannerViewController/);
  assert.doesNotMatch(iosPlugin, /weak var scannerController/);
  assert.match(iosPlugin, /dismiss complete/);
  assert.match(iosPlugin, /event emission begin: barcode/);
  assert.match(iosPlugin, /stopScan ignored: no active scanner/);
  assert.doesNotMatch(iosPlugin, /previewContainer/);
  assert.doesNotMatch(iosPlugin, /WKWebView/);
  assert.match(scannerController, /AVCaptureVideoPreviewLayer\(session: captureSession\)/);
  assert.match(scannerController, /view\.layer\.insertSublayer\(previewLayer, at: 0\)/);
  assert.match(scannerController, /override func viewDidAppear/);
  assert.match(scannerController, /override func viewWillDisappear/);
  assert.match(scannerController, /sessionQueue/);
  assert.match(scannerController, /\.ean13, \.ean8, \.upce, \.code128, \.code39/);
  assert.match(scannerController, /UINotificationFeedbackGenerator/);
  assert.match(scannerController, /case manual/);
  assert.match(scannerController, /case cancelled/);
  assert.match(scannerController, /prepareForDismissal/);
  assert.match(scannerController, /deinit entered/);
  assert.match(scannerController, /setMetadataObjectsDelegate\(nil, queue: nil\)/);
  assert.match(scannerController, /capture cleanup complete/);
  const deinitBlock = scannerController.slice(
    scannerController.indexOf("deinit {"),
    scannerController.indexOf("func prepareForDismissal")
  );
  assert.doesNotMatch(deinitBlock, /stopCapture\(/);
});

test("a genuine barcode miss is an explicit creation state rather than a hidden native-scanner branch", async () => {
  const [workflow, route] = await Promise.all([
    readFile(quickActionsUrl, "utf8"),
    readFile(
      new URL("../app/api/nutrition/foods/barcode/[barcode]/route.ts", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(route, /status: "not_found", barcode/);
  assert.match(route, /\[Barcode\] OFF result not_found/);
  assert.match(workflow, /type BarcodeLookupState/);
  assert.match(workflow, /setLookupState\("not_found"\)/);
  assert.match(workflow, /!missingBarcode/);
  assert.match(workflow, /setContributionMode\("manual"\);[\s\S]*setLookupState\("creating_manual"\)/);
  assert.match(workflow, /window\.setTimeout\(\(\) => activeController\.abort\(\), 12_000\)/);
});
