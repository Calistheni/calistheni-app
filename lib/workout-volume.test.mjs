import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWorkoutVolumeKg,
  getPersistedVolumeSetCompletion,
} from "./workout-volume.ts";

function externalWeightVolume(sets) {
  return calculateWorkoutVolumeKg({
    exercises: [
      {
        trackingType: "EXTERNAL_WEIGHT",
        bodyweightLoadFactor: null,
        sets,
      },
    ],
    userBodyweightKg: null,
  });
}

test("incomplete sets do not contribute volume", () => {
  assert.equal(
    externalWeightVolume([
      { completed: false, reps: 10, weightKg: 20 },
    ]),
    0
  );
});

test("completed sets contribute volume and reflect edited values", () => {
  const set = { completed: true, reps: 10, weightKg: 20 };

  assert.equal(externalWeightVolume([set]), 200);
  assert.equal(externalWeightVolume([{ ...set, reps: 12 }]), 240);
});

test("a completed set stops contributing when toggled incomplete", () => {
  const set = { completed: true, reps: 10, weightKg: 20 };

  assert.equal(externalWeightVolume([set]), 200);
  assert.equal(
    externalWeightVolume([{ ...set, completed: false }]),
    0
  );
});

test("mixed sets count only completed work", () => {
  assert.equal(
    externalWeightVolume([
      { completed: true, reps: 10, weightKg: 20 },
      { completed: false, reps: 10, weightKg: 50 },
    ]),
    200
  );
});

test("incomplete bodyweight work does not block completed external-weight volume", () => {
  assert.equal(
    calculateWorkoutVolumeKg({
      exercises: [
        {
          trackingType: "BODYWEIGHT_REPS",
          bodyweightLoadFactor: 1,
          sets: [{ completed: false, reps: 10, weightKg: null }],
        },
        {
          trackingType: "EXTERNAL_WEIGHT",
          bodyweightLoadFactor: null,
          sets: [{ completed: true, reps: 10, weightKg: 20 }],
        },
      ],
      userBodyweightKg: null,
    }),
    200
  );
});

test("completed bodyweight work without bodyweight keeps volume unavailable", () => {
  assert.equal(
    calculateWorkoutVolumeKg({
      exercises: [
        {
          trackingType: "BODYWEIGHT_REPS",
          bodyweightLoadFactor: 1,
          sets: [{ completed: true, reps: 10, weightKg: null }],
        },
      ],
      userBodyweightKg: null,
    }),
    null
  );
});

test("sets without a completion flag remain included for legacy callers", () => {
  assert.equal(
    externalWeightVolume([{ reps: 10, weightKg: 20 }]),
    200
  );
});

test("migrated false flags remain compatible for untouched legacy workouts", () => {
  assert.equal(
    getPersistedVolumeSetCompletion({
      completed: false,
      workoutUpdatedAt: new Date("2026-07-05T15:48:57.000Z"),
    }),
    undefined
  );
  assert.equal(
    getPersistedVolumeSetCompletion({
      completed: false,
      workoutUpdatedAt: new Date("2026-07-05T15:48:58.000Z"),
    }),
    false
  );
});
