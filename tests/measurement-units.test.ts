import assert from "node:assert/strict";
import test from "node:test";
import {
  displayDistanceToMeters,
  displayWeightToKg,
  formatDistance,
  formatWeight,
  KG_PER_LB,
  LB_PER_KG,
  METERS_PER_MILE,
  weightKgToDisplay,
} from "@/lib/measurement-units";
import {
  buildExercisePersonalRecordContext,
  getActiveSetPersonalRecordDisplay,
} from "@/lib/workout-performance-references";

test("weight conversions preserve canonical kilograms through metric and imperial displays", () => {
  assert.ok(Math.abs(weightKgToDisplay(1, "IMPERIAL") - 2.2046226218) < 1e-10);
  assert.ok(Math.abs(weightKgToDisplay(12, "IMPERIAL") - 26.4554714616) < 1e-10);
  assert.ok(Math.abs(displayWeightToKg(135, "IMPERIAL") - 61.23496995) < 1e-8);
  assert.ok(Math.abs(displayWeightToKg(weightKgToDisplay(12, "IMPERIAL"), "IMPERIAL") - 12) < 1e-8);
  assert.ok(Math.abs(KG_PER_LB * LB_PER_KG - 1) < 1e-10);
  assert.equal(formatWeight(12, "METRIC"), "12kg");
  assert.equal(formatWeight(12, "IMPERIAL"), "26.5lb");
});

test("distance conversion and formatting retain canonical meters", () => {
  assert.equal(displayDistanceToMeters(1, "IMPERIAL"), METERS_PER_MILE);
  assert.equal(formatDistance(5000, "METRIC"), "5km");
  assert.equal(formatDistance(5000, "IMPERIAL"), "3.11mi");
  assert.ok(Math.abs(displayDistanceToMeters(5000 / METERS_PER_MILE, "IMPERIAL") - 5000) < 1e-10);
});

test("PR matching stays canonical while weighted display follows the preference", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 12, reps: 12 }]);
  const set = { reps: null, weight: null, durationSeconds: null, distanceMeters: null, steps: null, floors: null, rpe: null, notes: null, completed: false, supersetRoundIndex: null, supersetRoundId: null };
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set, previousWeight: 12, measurementSystem: "METRIC" })?.value, "12kg × 12");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set, previousWeight: 12, measurementSystem: "IMPERIAL" })?.value, "26.5lb × 12");
});
