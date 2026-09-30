import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEffectiveSetLoadKg,
  calculateSetVolumeKg,
  calculateWorkoutVolumeKg,
  getPersistedVolumeSetCompletion,
} from "./workout-volume.ts";
import {
  displayWeightToKg,
  weightKgToDisplay,
} from "./measurement-units.ts";

function setVolume({
  trackingType,
  bodyweightKg,
  externalWeightKg,
  reps,
  bodyweightLoadFactor =
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT"
      ? 1
      : null,
}) {
  return calculateSetVolumeKg({
    trackingType,
    reps,
    weightKg: externalWeightKg,
    userBodyweightKg: bodyweightKg,
    bodyweightLoadFactor,
  });
}

test("weighted pull-up volume combines bodyweight and added weight", () => {
  assert.equal(
    setVolume({
      trackingType: "WEIGHTED_BODYWEIGHT",
      bodyweightKg: 90,
      externalWeightKg: 10,
      reps: 10,
    }),
    1_000
  );
});

test("bodyweight exercise volume uses bodyweight without external load", () => {
  assert.equal(
    setVolume({
      trackingType: "BODYWEIGHT_REPS",
      bodyweightKg: 90,
      externalWeightKg: null,
      reps: 10,
    }),
    900
  );
});

test("weighted dip volume combines bodyweight and added weight", () => {
  assert.equal(
    setVolume({
      trackingType: "WEIGHTED_BODYWEIGHT",
      bodyweightKg: 80,
      externalWeightKg: 20,
      reps: 8,
    }),
    800
  );
});

test("zero added weight still uses bodyweight for weighted-bodyweight volume", () => {
  assert.equal(
    setVolume({
      trackingType: "WEIGHTED_BODYWEIGHT",
      bodyweightKg: 90,
      externalWeightKg: 0,
      reps: 10,
    }),
    900
  );
});

test("external-weight exercise volume does not include bodyweight", () => {
  assert.equal(
    setVolume({
      trackingType: "EXTERNAL_WEIGHT",
      bodyweightKg: 90,
      externalWeightKg: 80,
      reps: 10,
    }),
    800
  );
});

test("weighted-bodyweight volume is unavailable without bodyweight", () => {
  assert.equal(
    setVolume({
      trackingType: "WEIGHTED_BODYWEIGHT",
      bodyweightKg: null,
      externalWeightKg: 10,
      reps: 10,
    }),
    null
  );
});

test("multiple weighted-bodyweight sets use the combined load", () => {
  assert.equal(
    calculateWorkoutVolumeKg({
      exercises: [
        {
          trackingType: "WEIGHTED_BODYWEIGHT",
          bodyweightLoadFactor: 1,
          sets: [
            { completed: true, reps: 10, weightKg: 10 },
            { completed: true, reps: 5, weightKg: 20 },
          ],
        },
      ],
      userBodyweightKg: 90,
    }),
    1_550
  );
});

test("effective load keeps the logged external weight separate", () => {
  const externalWeightKg = 10;
  assert.equal(
    calculateEffectiveSetLoadKg({
      trackingType: "WEIGHTED_BODYWEIGHT",
      weightKg: externalWeightKg,
      userBodyweightKg: 90,
      bodyweightLoadFactor: 1,
    }),
    100
  );
  assert.equal(externalWeightKg, 10);
});

test("imperial entry is normalized to kilograms before volume calculation", () => {
  const addedWeightLb = weightKgToDisplay(10, "IMPERIAL");
  const addedWeightKg = displayWeightToKg(addedWeightLb, "IMPERIAL");
  const volumeKg = setVolume({
    trackingType: "WEIGHTED_BODYWEIGHT",
    bodyweightKg: 90,
    externalWeightKg: addedWeightKg,
    reps: 10,
  });

  assert.ok(Math.abs(volumeKg - 1_000) < 1e-8);
});

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

test("bodyweight load factors drive exercise volume", () => {
  assert.equal(
    calculateWorkoutVolumeKg({
      exercises: [
        {
          trackingType: "BODYWEIGHT_REPS",
          bodyweightLoadFactor: 2,
          sets: [{ completed: true, reps: 5, weightKg: null }],
        },
      ],
      userBodyweightKg: 80,
    }),
    800
  );
});

test("duration exercises do not contribute kilogram volume", () => {
  assert.equal(
    calculateWorkoutVolumeKg({
      exercises: [
        {
          trackingType: "DURATION",
          bodyweightLoadFactor: 0.3,
          sets: [{ completed: true, reps: null, weightKg: null }],
        },
      ],
      userBodyweightKg: 80,
    }),
    0
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
