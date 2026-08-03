import assert from "node:assert/strict";
import test from "node:test";
import { calculateAnthropometrySummary, FREE_MEASUREMENT_HISTORY_LIMIT, getMeasurementCapabilities } from "./anthropometry.ts";
import { mergeMeasurementSnapshot, validateStoredMeasurementCapabilities } from "./progress.ts";

const completeSnapshot = {
  heightCm: 188,
  bodyweightKg: 90,
  waistCm: 88,
  neckCm: 40,
  shouldersCm: 127,
  chestCm: 105,
  hipsCm: 104,
  leftUpperArmCm: 40,
  rightUpperArmCm: 40,
  leftForearmCm: 30,
  rightForearmCm: 30,
  leftThighCm: 58,
  rightThighCm: 58,
  leftCalfCm: 40,
  rightCalfCm: 40,
};

test("a partial waist update creates a complete merged measurement snapshot", () => {
  const merged = mergeMeasurementSnapshot(completeSnapshot, { waistCm: 86 });
  assert.equal(merged.waistCm, 86);
  for (const [field, value] of Object.entries(completeSnapshot)) {
    if (field !== "waistCm") assert.equal(merged[field], value);
  }
  assert.equal(completeSnapshot.waistCm, 88, "the historical snapshot is not mutated");
});

test("entitlement validation blocks restricted changes without erasing existing Pro values", () => {
  assert.equal(FREE_MEASUREMENT_HISTORY_LIMIT, 10);
  assert.equal(getMeasurementCapabilities(false).historyLimit, 10);
  assert.equal(validateStoredMeasurementCapabilities({ shouldersCm: 127 }, false).success, false);
  const afterFreeFieldUpdate = mergeMeasurementSnapshot(completeSnapshot, { waistCm: 86 });
  assert.equal(afterFreeFieldUpdate.shouldersCm, 127);
  assert.equal(afterFreeFieldUpdate.leftThighCm, 58);
});

test("omitted fields remain present across sequential partial updates", () => {
  const afterWeight = mergeMeasurementSnapshot(completeSnapshot, { bodyweightKg: 88 });
  const afterWaist = mergeMeasurementSnapshot(afterWeight, { waistCm: 85 });
  assert.equal(afterWeight.waistCm, 88);
  assert.equal(afterWeight.neckCm, 40);
  assert.equal(afterWeight.hipsCm, 104);
  assert.equal(afterWaist.bodyweightKg, 88);
  assert.equal(afterWaist.waistCm, 85);
  assert.equal(afterWaist.leftThighCm, 58);
});

test("an explicit clear removes only the selected field while empty submissions preserve values", () => {
  const unchanged = mergeMeasurementSnapshot(completeSnapshot, {});
  assert.deepEqual(unchanged, completeSnapshot);
  const cleared = mergeMeasurementSnapshot(completeSnapshot, {}, ["hipsCm"]);
  assert.equal(cleared.hipsCm, null);
  assert.equal(cleared.waistCm, 88);
  assert.equal(cleared.chestCm, 105);
});

test("derived calculations receive the complete merged latest snapshot", () => {
  const merged = mergeMeasurementSnapshot(completeSnapshot, { waistCm: 86 });
  const summary = calculateAnthropometrySummary({
    bodyweightKg: Number(merged.bodyweightKg),
    heightCm: Number(merged.heightCm),
    manualBodyFatPercent: 20,
    waistAtNavelCm: Number(merged.waistCm),
    hipsCm: Number(merged.hipsCm),
  });
  assert.equal(summary.leanBodyMassKg, 72);
  assert.equal(summary.waistToHipRatio, 86 / 104);
  assert.equal(summary.waistToHeightRatio, 86 / 188);
});

test("the tracker pre-fills and submits only changed values with an explicit clear mechanism", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/profile/MeasurementTracker.tsx", import.meta.url), "utf8"));
  assert.match(source, /for \(const \[field\] of STORAGE_FIELDS\)/);
  assert.match(source, /raw === initialValues\[field\]\?\.trim\(\)/);
  assert.match(source, /clearFields/);
});
