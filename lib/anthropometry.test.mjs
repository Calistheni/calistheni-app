import assert from "node:assert/strict";
import test from "node:test";
import {
  MEASUREMENT_CATALOGUE, MEASUREMENT_KEYS, FREE_MEASUREMENT_HISTORY_LIMIT,
  bodyFatDisplayValue, calculateAnthropometrySummary, calculateFatMassKg,
  calculateFfmi, calculateLeanBodyMassKg, calculateWaistToHeightRatio,
  calculateWaistToHipRatio, centimetersToInches, estimateBodyFatPercentage,
  getMeasurementCapabilities, validateMeasurementCapabilities, validateMeasurementValues,
} from "./anthropometry.ts";

test("male Navy estimate uses inches and safely rejects missing or invalid inputs", () => {
  const value = estimateBodyFatPercentage({ sex: "MALE", heightCm: 180, neckCm: 38, waistAtNavelCm: 85 });
  const expected = 86.010 * Math.log10((85 - 38) / 2.54) - 70.041 * Math.log10(180 / 2.54) + 36.76;
  assert.ok(Math.abs(value - expected) < 1e-12);
  assert.equal(centimetersToInches(2.54), 1);
  for (const invalid of [{ sex: "MALE", neckCm: 38, waistAtNavelCm: 85 }, { sex: "MALE", heightCm: 180, waistAtNavelCm: 85 }, { sex: "MALE", heightCm: 180, neckCm: 38 }, { sex: "MALE", heightCm: 180, neckCm: 85, waistAtNavelCm: 85 }, { sex: "MALE", heightCm: Infinity, neckCm: 38, waistAtNavelCm: 85 }]) assert.equal(estimateBodyFatPercentage(invalid), null);
});

test("female Navy estimate uses inches, requires hips, and never produces non-finite output", () => {
  const value = estimateBodyFatPercentage({ sex: "FEMALE", heightCm: 165, neckCm: 33, waistAtNavelCm: 75, hipsCm: 100 });
  const expected = 163.205 * Math.log10((75 + 100 - 33) / 2.54) - 97.684 * Math.log10(165 / 2.54) - 78.387;
  assert.ok(Math.abs(value - expected) < 1e-12);
  assert.equal(estimateBodyFatPercentage({ sex: "FEMALE", heightCm: 165, neckCm: 33, waistAtNavelCm: 75 }), null);
  assert.equal(estimateBodyFatPercentage({ sex: "FEMALE", heightCm: 165, neckCm: 100, waistAtNavelCm: 40, hipsCm: 40 }), null);
});

test("manual body fat stays separate and takes display precedence", () => {
  assert.deepEqual(bodyFatDisplayValue(18, 21), { value: 18, source: "manual" });
  assert.deepEqual(bodyFatDisplayValue(null, 21), { value: 21, source: "estimated" });
  assert.deepEqual(bodyFatDisplayValue(null, null), { value: null, source: "unavailable" });
});

test("composition and ratio calculations are accurate and safe", () => {
  assert.equal(calculateFatMassKg(80, 20), 16);
  assert.equal(calculateLeanBodyMassKg(80, 20), 64);
  assert.equal(calculateFfmi(80, 180, 20), 64 / 1.8 ** 2);
  assert.equal(calculateWaistToHeightRatio(90, 180), 0.5);
  assert.equal(calculateWaistToHipRatio(90, 100), 0.9);
  assert.deepEqual(calculateAnthropometrySummary({ bodyweightKg: 80, heightCm: 180, manualBodyFatPercent: 20, waistAtNavelCm: 90, hipsCm: 100 }), { fatMassKg: 16, leanBodyMassKg: 64, ffmi: 64 / 1.8 ** 2, waistToHeightRatio: 0.5, waistToHipRatio: 0.9 });
  assert.equal(calculateFatMassKg(null, 20), null);
  assert.equal(calculateFfmi(80, 0, 20), null);
  assert.equal(calculateWaistToHeightRatio(90, 0), null);
  assert.equal(calculateWaistToHipRatio(90, 0), null);
});

test("catalogue validates all canonical values and rejects malformed entries", () => {
  for (const key of MEASUREMENT_KEYS) {
    const metadata = MEASUREMENT_CATALOGUE[key];
    assert.ok(metadata.label && metadata.category && metadata.unit && metadata.min < metadata.max);
  }
  assert.equal(validateMeasurementValues({ bodyweightKg: 80.5 }).success, true);
  assert.equal(validateMeasurementValues({ bodyweightKg: "80" }).success, false);
  assert.equal(validateMeasurementValues({ bodyweightKg: -1 }).success, false);
  assert.equal(validateMeasurementValues({ unsupported: 1 }).success, false);
  assert.equal(validateMeasurementValues({}).success, false);
});

test("Free and Pro capabilities are enforced for direct submissions", () => {
  const free = getMeasurementCapabilities(false);
  assert.deepEqual(free.allowedKeys, ["bodyweightKg", "neckCm", "chestCm", "waistAtNavelCm", "leftUpperArmFlexedCm", "rightUpperArmFlexedCm"]);
  assert.equal(free.historyLimit, FREE_MEASUREMENT_HISTORY_LIMIT);
  assert.equal(getMeasurementCapabilities(true).historyLimit, null);
  assert.equal(free.canEstimateBodyFat, false);
  assert.equal(free.canViewCalculatedMetrics, false);
  assert.equal(free.canViewMeasurementCharts, false);
  assert.equal(validateMeasurementCapabilities({ hipsCm: 100 }, false).success, false);
  assert.equal(validateMeasurementCapabilities({ shouldersCm: 110 }, false).success, false);
  assert.equal(validateMeasurementCapabilities({ leftThighCm: 60 }, false).success, false);
  assert.equal(validateMeasurementCapabilities({ bodyweightKg: 80, neckCm: 38 }, false).success, true);
  assert.equal(validateMeasurementCapabilities(Object.fromEntries(MEASUREMENT_KEYS.map((key) => [key, MEASUREMENT_CATALOGUE[key].min])), true).success, true);
});

test("legacy measurement JSON remains parseable without newer canonical keys", () => {
  const oldEntry = JSON.parse('{"bodyweightKg":80,"neckCm":38,"chestCm":100}');
  assert.equal(validateMeasurementValues(oldEntry).success, true);
});
