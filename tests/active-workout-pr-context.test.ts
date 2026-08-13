import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExercisePersonalRecordContext,
  formatWeightedPerformance,
  getActiveSetPersonalRecordDisplay,
} from "@/lib/workout-performance-references";

const emptySet = {
  reps: null, weight: null, durationSeconds: null, distanceMeters: null,
  steps: null, floors: null, rpe: null, notes: null, completed: false,
  supersetRoundIndex: null, supersetRoundId: null,
};

test("bodyweight PR is all-time completed max reps, separate from previous session", () => {
  const context = buildExercisePersonalRecordContext([{ reps: 8 }, { reps: 13 }, { reps: 10 }], { MAX_REPS: 13 });
  assert.deepEqual(getActiveSetPersonalRecordDisplay({ context, trackingType: "BODYWEIGHT_REPS", set: { ...emptySet, reps: 12 } }), { value: "13", isNew: false, label: "All-time best reps for this exercise" });
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "BODYWEIGHT_REPS", set: { ...emptySet, reps: 14 } })?.isNew, true);
});

test("external-weight PRs show the complete weight-specific performance", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 65, reps: 8 }, { weight: 65.0, reps: 10 }, { weight: 70, reps: 6 }, { weight: 15, reps: 5 }]);
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 65, reps: 9 } })?.value, "65kg × 10");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 70, reps: 7 } })?.isNew, true);
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: emptySet }), null);
});

test("weighted-bodyweight PRs use the same no-plus formatter as external weight", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 5, reps: 20 }, { weight: 10, reps: 15 }, { weight: 15, reps: 8 }]);
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set: { ...emptySet, weight: 10, reps: 14 } })?.value, "10kg × 15");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set: { ...emptySet, weight: 10, reps: 16 } })?.newValue, "10kg × 16");
});

test("timed and distance PR context uses completed historical duration or distance", () => {
  const context = buildExercisePersonalRecordContext([{ durationSeconds: 45, distanceMeters: 1000 }, { durationSeconds: 60, distanceMeters: 2000 }], { LONGEST_DURATION: 60 });
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "DURATION", set: emptySet })?.value, "1:00");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "DISTANCE_DURATION", set: emptySet })?.value, "2km");
});

test("weight buckets deduplicate equivalent decimal input while retaining plate precision", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 65, reps: 10 }, { weight: 62.5, reps: 12 }]);
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 65.0 } })?.value, "65kg × 10");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 62.5 } })?.value, "62.5kg × 12");
});

test("weighted-performance formatting is shared by previous and PR displays", () => {
  assert.equal(formatWeightedPerformance({ weight: 65, reps: 10 }), "65kg × 10");
  assert.equal(formatWeightedPerformance({ weight: 10, reps: 15 }), "10kg × 15");
  assert.equal(formatWeightedPerformance({ weight: 62.5, reps: 8 }), "62.5kg × 8");
});

test("weight-specific PR lookup updates locally when the entered weight changes", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 60, reps: 12 }, { weight: 65, reps: 10 }, { weight: 70, reps: 7 }]);
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 60 } })?.value, "60kg × 12");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 65 } })?.value, "65kg × 10");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: { ...emptySet, weight: 75 } })?.value, null);
});

test("weighted-bodyweight PR falls back to Previous weight when the current row is empty", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 12, reps: 8 }, { weight: 12, reps: 12 }, { weight: 15, reps: 7 }]);
  const emptyCurrent = { ...emptySet };
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set: emptyCurrent, previousWeight: 12 })?.value, "12kg × 12");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set: { ...emptyCurrent, weight: 15 }, previousWeight: 12 })?.value, "15kg × 7");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set: emptyCurrent, previousWeight: 12 })?.value, "12kg × 12");
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "WEIGHTED_BODYWEIGHT", set: { ...emptyCurrent, weight: 20 }, previousWeight: 12 })?.value, null);
});

test("external-weight PR also falls back to its Previous weight", () => {
  const context = buildExercisePersonalRecordContext([{ weight: 65, reps: 10 }, { weight: 65, reps: 12 }]);
  assert.equal(getActiveSetPersonalRecordDisplay({ context, trackingType: "EXTERNAL_WEIGHT", set: emptySet, previousWeight: 65 })?.value, "65kg × 12");
});
