import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workoutMutationSchema } from "../lib/validation/workouts.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("workout validation accepts repeated definitions with distinct local instance IDs", () => {
  const result = workoutMutationSchema.safeParse({
    title: "Duplicates",
    notes: null,
    startedAt: null,
    completedAt: null,
    visibility: "PRIVATE",
    supersets: [
      {
        key: "superset-a",
        label: null,
        colorKey: "BLUE",
        restSeconds: 90,
        plannedRounds: 1,
        hardRoundLimit: null,
        exerciseLocalIds: ["pull-up-1", "pull-up-2"],
      },
    ],
    exercises: ["pull-up-1", "pull-up-2"].map((localId) => ({
      localId,
      exerciseId: "pull-up",
      notes: null,
      restSeconds: 90,
      supersetKey: null,
      supersetPosition: null,
      sets: [{ reps: 8, weight: null, durationSeconds: null, distanceMeters: null, steps: null, floors: null, rpe: null, notes: null, completed: false, supersetRoundIndex: null, supersetRoundId: null }],
    })),
  });
  assert.equal(result.success, true);
});

test("builders add by exercise instance and keep duplicate picker actions available", () => {
  const workoutBuilder = read("components/workouts/WorkoutBuilder.tsx");
  const routineBuilder = read("components/routines/RoutineBuilder.tsx");
  assert.doesNotMatch(workoutBuilder, /function addExercise\(exerciseId: string\) \{\s*if \(selectedExercises\.some/);
  assert.doesNotMatch(routineBuilder, /function addExercise\(exerciseId: string\) \{\s*if \(selectedExercises\.some/);
  assert.match(workoutBuilder, /const localId = crypto\.randomUUID\(\)/);
  assert.match(routineBuilder, /localId: crypto\.randomUUID\(\)/);
  assert.match(workoutBuilder, /existingOccurrenceCount/);
  assert.match(routineBuilder, /occurrenceCount/);
});

test("duplicate labels and superset membership identities use the instance local ID", () => {
  const workoutBuilder = read("components/workouts/WorkoutBuilder.tsx");
  const routineBuilder = read("components/routines/RoutineBuilder.tsx");
  assert.match(workoutBuilder, /getExerciseInstanceLabel\(selectedExercise\.localId, exercise\.id, exercise\.name\)/);
  assert.match(routineBuilder, /getExerciseInstanceLabel\(selectedExercise\.localId, exercise\.id, exercise\.name\)/);
  assert.match(workoutBuilder, /getSupersetMembershipSortableId\(supersetEditorKey \?\? "new", selectedExercise\.localId\)/);
  assert.match(routineBuilder, /getSupersetMembershipSortableId\(editingSupersetKey \?\? "new", selectedExercise\.localId\)/);
});
