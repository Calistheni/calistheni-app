import assert from "node:assert/strict";
import test from "node:test";
import { routineMutationSchema } from "../lib/validation/routines.ts";

function routinePayload() {
  return {
    name: "Superset routine",
    description: null,
    visibility: "PRIVATE",
    supersets: [
      {
        key: "superset-a",
        label: "Superset A",
        colorKey: "BLUE",
        restSeconds: 90,
        plannedRounds: 3,
        hardRoundLimit: null,
        exerciseClientIds: ["temp-pull-up", "temp-dip"],
      },
    ],
    exercises: [
      {
        clientExerciseId: "temp-pull-up",
        routineExerciseId: null,
        exerciseId: "pull-up",
        restSeconds: 90,
        notes: null,
        sets: [
          {
            reps: 10,
            weightKg: null,
            durationSec: null,
            distanceMeters: null,
            steps: null,
            floors: null,
          },
        ],
      },
      {
        clientExerciseId: "temp-dip",
        routineExerciseId: null,
        exerciseId: "dip",
        restSeconds: 90,
        notes: null,
        sets: [
          {
            reps: 15,
            weightKg: null,
            durationSec: null,
            distanceMeters: null,
            steps: null,
            floors: null,
          },
        ],
      },
    ],
  };
}

test("accepts a valid routine superset with stable positions", () => {
  const result = routineMutationSchema.safeParse(routinePayload());
  assert.equal(result.success, true);
});

test("rejects supersets with fewer than two exercises", () => {
  const payload = routinePayload();
  payload.supersets[0].exerciseClientIds = ["temp-pull-up"];
  const result = routineMutationSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("rejects an unknown client exercise reference", () => {
  const payload = routinePayload();
  payload.supersets[0].exerciseClientIds[1] = "temp-missing";
  const result = routineMutationSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("rejects duplicate superset identifiers", () => {
  const payload = routinePayload();
  payload.supersets.push({ ...payload.supersets[0] });
  const result = routineMutationSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("rejects one exercise in multiple supersets", () => {
  const payload = routinePayload();
  payload.supersets.push({
    ...payload.supersets[0],
    key: "superset-b",
    exerciseClientIds: ["temp-pull-up", "temp-dip"],
  });
  const result = routineMutationSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("accepts mixed persisted and unsaved request exercise keys", () => {
  const payload = routinePayload();
  payload.exercises[0].routineExerciseId = 42;
  const result = routineMutationSchema.safeParse(payload);
  assert.equal(result.success, true);
});
