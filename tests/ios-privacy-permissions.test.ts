import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { appleHealthAuthorizationCopy } from "@/lib/native/apple-health-permission-copy";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("iOS photo selection uses PHPicker without requesting photo-library authorization", async () => {
  const [plugin, bridge, plist] = await Promise.all([
    source("ios/App/App/CalistheniNutritionPhotoPickerPlugin.swift"),
    source("lib/native/nutrition-label-camera.ts"),
    source("ios/App/App/Info.plist"),
  ]);

  assert.match(plugin, /PHPickerConfiguration\(\)/);
  assert.match(plugin, /PHPickerViewController\(configuration:/);
  assert.doesNotMatch(plugin, /PHPhotoLibrary\.(authorizationStatus|requestAuthorization)/);
  assert.match(bridge, /CalistheniNutritionPhotoPicker/);
  assert.match(bridge, /iosPicker\.getPhoto\(\{ source \}\)/);
  assert.match(bridge, /source === "camera" \? CameraSource\.Camera : CameraSource\.Photos/);
  assert.match(plist, /Calistheni uses the system photo picker so you can select a nutrition-label photo/);
  assert.doesNotMatch(plist, /NSPhotoLibraryAddUsageDescription/);
  assert.match(bridge, /saveToGallery: false/);
});

test("iOS camera capture remains user-triggered and handles denied permission", async () => {
  const [plugin, plist] = await Promise.all([
    source("ios/App/App/CalistheniNutritionPhotoPickerPlugin.swift"),
    source("ios/App/App/Info.plist"),
  ]);

  assert.match(plugin, /AVCaptureDevice\.authorizationStatus\(for: \.video\)/);
  assert.match(plugin, /AVCaptureDevice\.requestAccess\(for: \.video\)/);
  assert.match(plugin, /CAMERA_PERMISSION_DENIED/);
  assert.match(plugin, /picker\.sourceType = \.camera/);
  assert.match(plist, /scan nutrition barcodes or capture food label photos/);
});

test("native barcode scanning retains camera denial handling and manual fallback", async () => {
  const [scanner, plugin] = await Promise.all([
    source("lib/native/barcode-scanner.ts"),
    source("ios/App/App/NutritionBarcodeScannerPlugin.swift"),
  ]);

  assert.match(scanner, /permission\.camera !== "granted" && permission\.camera !== "limited"/);
  assert.match(scanner, /reason: "denied"/);
  assert.match(plugin, /AVCaptureDevice\.authorizationStatus\(for: \.video\)/);
  assert.match(plugin, /AVCaptureDevice\.requestAccess\(for: \.video\)/);
});

test("ParksMap does not persist exact location or request it automatically at load", async () => {
  const parksMap = await source("components/ParksMap.tsx");

  assert.match(parksMap, /clearLegacyUserLocation\(\)/);
  assert.match(parksMap, /localStorage\.removeItem\("user-location"\)/);
  assert.doesNotMatch(parksMap, /localStorage\.setItem\("user-location"/);
  assert.doesNotMatch(parksMap, /localStorage\.setItem\("location-allowed"/);
  assert.doesNotMatch(parksMap, /localStorage\.getItem\("location-allowed"\) === "true"[\s\S]{0,250}geolocateRef\.current\?\.trigger/);
  assert.match(parksMap, /function requestUserLocation\(\)/);
  assert.match(parksMap, /mode === "public" && !isFocusedRef\.current/);
  assert.match(parksMap, /manualCameraInteractionWhileTrackingRef/);
});

test("map viewports and nearby coordinate checks keep precise coordinates out of URLs", async () => {
  const [map, route, nearbyRoute, submission] = await Promise.all([
    source("components/ParksMap.tsx"),
    source("app/api/parks/map/route.ts"),
    source("app/api/parks/nearby-check/route.ts"),
    source("components/user/ParkSubmissionForm.tsx"),
  ]);

  assert.match(map, /fetch\(mapEndpoint,\s*\{[\s\S]*?method: "POST"/);
  assert.match(route, /export async function POST/);
  assert.match(nearbyRoute, /export async function POST/);
  assert.match(submission, /fetch\("\/api\/parks\/nearby-check",\s*\{\s*method: "POST"/);
  assert.doesNotMatch(map, /fetch\(`\$\{mapEndpoint\}\?\$\{viewport\.params/);
  assert.doesNotMatch(submission, /nearby-check\?\$\{searchParams\}/);
});

test("privacy manifest declares app functionality data without tracking and retains UserDefaults reason", async () => {
  const manifest = await source("ios/App/App/PrivacyInfo.xcprivacy");

  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(manifest, /<key>NSPrivacyTrackingDomains<\/key>\s*<array\s*\/>/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeEmailAddress/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeOtherUserContactInfo/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeOtherDataTypes/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeFitness/);
  assert.match(manifest, /NSPrivacyCollectedDataTypePreciseLocation/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeHealth/);
  assert.match(manifest, /NSPrivacyCollectedDataTypePhotosorVideos/);
  assert.match(manifest, /NSPrivacyCollectedDataTypePurchaseHistory/);
  assert.match(manifest, /NSPrivacyCollectedDataTypePurposeAppFunctionality/);
  assert.match(manifest, /NSPrivacyCollectedDataTypePurposeAnalytics/);
  assert.match(manifest, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(manifest, /<string>CA92\.1<\/string>/);
});

test("HealthKit request status copy does not imply read access was granted", () => {
  const copy = appleHealthAuthorizationCopy("unnecessary");

  assert.match(copy, /does not reveal whether read access was allowed/);
  assert.match(copy, /unavailable data will appear empty/);
  assert.doesNotMatch(copy, /read access (was )?granted/i);
});
