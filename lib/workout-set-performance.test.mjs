import assert from "node:assert/strict";
import test from "node:test";

import { isIncompleteEnteredSet } from "./workout-set-performance.ts";

const EMPTY_SET = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  steps: null,
  floors: null,
  rpe: null,
  notes: null,
  completed: false,
};

test("empty incomplete bodyweight sets do not trigger", () => {
  assert.equal(isIncompleteEnteredSet(EMPTY_SET, "BODYWEIGHT_REPS"), false);
});

test("incomplete bodyweight sets with reps trigger", () => {
  assert.equal(
    isIncompleteEnteredSet({ ...EMPTY_SET, reps: 8 }, "BODYWEIGHT_REPS"),
    true
  );
});

test("completed bodyweight sets do not trigger", () => {
  assert.equal(
    isIncompleteEnteredSet(
      { ...EMPTY_SET, reps: 8, completed: true },
      "BODYWEIGHT_REPS"
    ),
    false
  );
});

test("incomplete weighted sets trigger for reps or weight", () => {
  assert.equal(
    isIncompleteEnteredSet(
      { ...EMPTY_SET, reps: 8, weight: 20 },
      "EXTERNAL_WEIGHT"
    ),
    true
  );
  assert.equal(
    isIncompleteEnteredSet(
      { ...EMPTY_SET, weight: 20 },
      "WEIGHTED_BODYWEIGHT"
    ),
    true
  );
});

test("incomplete duration sets with duration trigger", () => {
  assert.equal(
    isIncompleteEnteredSet(
      { ...EMPTY_SET, durationSeconds: 60 },
      "DURATION"
    ),
    true
  );
});

test("clearing meaningful values removes the trigger", () => {
  assert.equal(
    isIncompleteEnteredSet(
      { ...EMPTY_SET, reps: 0, weight: 0 },
      "EXTERNAL_WEIGHT"
    ),
    false
  );
});

test("all compound tracking types use their supported performance fields", () => {
  const cases = [
    ["DISTANCE_DURATION", { distanceMeters: 100 }],
    ["STEPS_DISTANCE_DURATION", { steps: 1_000 }],
    ["FLOORS_DISTANCE_DURATION", { floors: 10 }],
    ["WEIGHT_DISTANCE_DURATION", { weight: 15 }],
    ["NOT_SELECTED", { durationSeconds: 30 }],
  ];

  for (const [trackingType, values] of cases) {
    assert.equal(
      isIncompleteEnteredSet(
        { ...EMPTY_SET, ...values },
        trackingType
      ),
      true,
      trackingType
    );
  }
});
