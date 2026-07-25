import assert from "node:assert/strict";
import test from "node:test";
import {
  getTrackingTypeFieldConfig,
  sanitizeRoutineSetForTrackingType,
} from "../lib/exercise-tracking-fields.ts";

const populatedSet = {
  reps: 12,
  weightKg: 20,
  durationSec: 60,
  distanceMeters: 400,
  steps: 500,
  floors: 10,
};

test("bodyweight routine sets expose and retain reps only", () => {
  const fields = getTrackingTypeFieldConfig("BODYWEIGHT_REPS");
  assert.deepEqual(
    {
      reps: fields.reps,
      weight: fields.weight,
      duration: fields.duration,
      distance: fields.distance,
    },
    { reps: true, weight: false, duration: false, distance: false }
  );
  assert.deepEqual(
    sanitizeRoutineSetForTrackingType(populatedSet, "BODYWEIGHT_REPS"),
    {
      ...populatedSet,
      weightKg: null,
      durationSec: null,
      distanceMeters: null,
      steps: null,
      floors: null,
    }
  );
});

test("weighted, duration, and distance tracking types use canonical fields", () => {
  assert.deepEqual(
    getTrackingTypeFieldConfig("WEIGHTED_BODYWEIGHT"),
    {
      reps: true,
      weight: true,
      duration: false,
      distance: false,
      steps: false,
      floors: false,
      weightLabel: "Added weight",
    }
  );
  assert.deepEqual(
    getTrackingTypeFieldConfig("DURATION"),
    {
      reps: false,
      weight: false,
      duration: true,
      distance: false,
      steps: false,
      floors: false,
      weightLabel: "Weight",
    }
  );
  assert.deepEqual(
    getTrackingTypeFieldConfig("STEPS_DISTANCE_DURATION"),
    {
      reps: false,
      weight: false,
      duration: true,
      distance: true,
      steps: true,
      floors: false,
      weightLabel: "Weight",
    }
  );
});

test("unsupported stale values are removed while supported zeroes survive", () => {
  assert.deepEqual(
    sanitizeRoutineSetForTrackingType(
      { ...populatedSet, reps: 0, weightKg: 0 },
      "EXTERNAL_WEIGHT"
    ),
    {
      reps: 0,
      weightKg: 0,
      durationSec: null,
      distanceMeters: null,
      steps: null,
      floors: null,
    }
  );
});
