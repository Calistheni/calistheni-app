import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attachActiveWorkoutTrackingMetadata,
  calculateActiveWorkoutVolumeKg,
  restoreActiveWorkoutTrackingMetadata,
} from "../lib/active-workout-volume";
import type { ExerciseListItem, WorkoutSetInput } from "../types/workout";

const weightedPullUp: ExerciseListItem = {
  id: "pull-up-weighted",
  slug: "pull-up-weighted",
  name: "Pull Up (Weighted)",
  muscle: "Back",
  secondaryMuscles: ["Biceps"],
  thumbnailUrl: null,
  videoUrl: null,
  trackingType: "WEIGHTED_BODYWEIGHT",
  bodyweightLoadFactor: 1,
};

const bodyweightPullUp: ExerciseListItem = {
  ...weightedPullUp,
  id: "pull-up",
  slug: "pull-up",
  name: "Pull Up",
  trackingType: "BODYWEIGHT_REPS",
};

const benchPress: ExerciseListItem = {
  ...weightedPullUp,
  id: "bench-press-barbell",
  slug: "bench-press-barbell",
  name: "Bench Press (Barbell)",
  muscle: "Chest",
  trackingType: "EXTERNAL_WEIGHT",
  bodyweightLoadFactor: null,
};

function completedSet(
  reps: number,
  weight: number | null
): Pick<WorkoutSetInput, "reps" | "weight" | "completed"> {
  return { reps, weight, completed: true };
}

function selectExercise(
  exercise: ExerciseListItem,
  set = completedSet(10, 10)
) {
  return attachActiveWorkoutTrackingMetadata(
    {
      localId: `active-${exercise.id}`,
      exerciseId: exercise.id,
      sets: [set],
    },
    exercise
  );
}

test("picker-selected weighted pull-up retains metadata and produces the live 1,000 kg volume", () => {
  const activeExercise = selectExercise(weightedPullUp);

  assert.equal(activeExercise.trackingType, "WEIGHTED_BODYWEIGHT");
  assert.equal(activeExercise.bodyweightLoadFactor, 1);
  assert.equal(activeExercise.sets[0]?.weight, 10);
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [activeExercise],
      userBodyweightKg: 90,
    }),
    1_000
  );
  // The set remains +10 kg; only its effective load/volume includes bodyweight.
  assert.equal(activeExercise.sets[0]?.weight, 10);
});

test("persisted active workout restores canonical weighted-bodyweight metadata", () => {
  const selected = selectExercise(weightedPullUp);
  const persisted = JSON.parse(JSON.stringify(selected)) as typeof selected;
  // Simulate the broken external-weight semantics that produced 100 kg.
  persisted.trackingType = "EXTERNAL_WEIGHT";
  persisted.bodyweightLoadFactor = null;
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [persisted],
      userBodyweightKg: 90,
    }),
    100
  );

  const restored = restoreActiveWorkoutTrackingMetadata(persisted, [
    weightedPullUp,
  ]);
  assert.ok(restored);
  assert.equal(restored.trackingType, "WEIGHTED_BODYWEIGHT");
  assert.equal(restored.bodyweightLoadFactor, 1);
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [restored],
      userBodyweightKg: 90,
    }),
    1_000
  );
});

test("routine-started weighted pull-up uses the same active-workout metadata path", () => {
  const routineExercise = selectExercise(weightedPullUp);

  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [routineExercise],
      userBodyweightKg: 90,
    }),
    1_000
  );
});

test("actual active-workout path preserves missing-bodyweight, bodyweight, and external-weight semantics", () => {
  const weighted = selectExercise(weightedPullUp);
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [weighted],
      userBodyweightKg: null,
    }),
    null
  );

  const bodyweight = selectExercise(
    bodyweightPullUp,
    completedSet(10, null)
  );
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [bodyweight],
      userBodyweightKg: 90,
    }),
    900
  );

  const external = selectExercise(benchPress, completedSet(10, 80));
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [external],
      userBodyweightKg: 90,
    }),
    800
  );
});

test("active-workout metadata cannot be attached to a different exercise ID", () => {
  assert.throws(
    () =>
      attachActiveWorkoutTrackingMetadata(
        { exerciseId: "pull-up", sets: [] },
        weightedPullUp
      ),
    /does not match/
  );
});

test("WorkoutBuilder live display consumes metadata owned by active-workout state", async () => {
  const builder = await readFile(
    new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url),
    "utf8"
  );

  assert.match(builder, /calculateActiveWorkoutVolumeKg\(\{[\s\S]*exercises: selectedExercises/);
  assert.match(builder, /trackingType: replacementExercise\.trackingType/);
  assert.match(builder, /readActiveWorkoutDraft\(sessionId, exercises\)/);
});
