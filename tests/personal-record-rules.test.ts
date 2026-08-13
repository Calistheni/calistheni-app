import assert from "node:assert/strict";
import test from "node:test";
import { isSetPersonalRecordCandidate } from "@/lib/personal-record-rules";

const baseSet = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  steps: null,
  floors: null,
  rpe: null,
  notes: null,
  completed: true,
  supersetRoundIndex: null,
  supersetRoundId: null,
};

test("PR candidate rules match persisted per-set record types", () => {
  assert.equal(isSetPersonalRecordCandidate({ set: { ...baseSet, weight: 70, reps: 8 }, trackingType: "EXTERNAL_WEIGHT", records: { MAX_EXTERNAL_WEIGHT: 65 } }), true);
  assert.equal(isSetPersonalRecordCandidate({ set: { ...baseSet, weight: 10, reps: 8 }, trackingType: "WEIGHTED_BODYWEIGHT", records: { MAX_ADDED_WEIGHT: 12, MAX_REPS: 8 } }), false);
  assert.equal(isSetPersonalRecordCandidate({ set: { ...baseSet, reps: 12 }, trackingType: "BODYWEIGHT_REPS", records: { MAX_REPS: 10 } }), true);
  assert.equal(isSetPersonalRecordCandidate({ set: { ...baseSet, durationSeconds: 61 }, trackingType: "DURATION", records: { LONGEST_DURATION: 60 } }), true);
});

test("a live entered set can show its prospective PR before completion", () => {
  assert.equal(isSetPersonalRecordCandidate({ set: { ...baseSet, completed: false, reps: 20 }, trackingType: "BODYWEIGHT_REPS", records: {} }), true);
});
