import assert from "node:assert/strict";
import test from "node:test";
import { rankExercisesForPicker } from "../lib/exercise-picker-ranking";

const exercises = [
  { id: "pull", name: "Pull Up", muscle: "Back" },
  { id: "dip", name: "Dip", muscle: "Chest" },
  { id: "push", name: "Push Up", muscle: "Chest" },
  { id: "chin", name: "Chin Up", muscle: "Back" },
].map((exercise) => ({ ...exercise, slug: exercise.id, secondaryMuscles: [], thumbnailUrl: null, videoUrl: null, trackingType: "BODYWEIGHT_REPS" as const, bodyweightLoadFactor: null }));

test("exercise picker ranks completed workout usage per user before defaults", () => {
  const ranked = rankExercisesForPicker(exercises, [
    { exerciseId: "pull", workoutCount: 30, lastUsedAt: "2026-08-10T00:00:00.000Z" },
    { exerciseId: "dip", workoutCount: 20, lastUsedAt: "2026-08-12T00:00:00.000Z" },
    { exerciseId: "push", workoutCount: 10, lastUsedAt: "2026-08-11T00:00:00.000Z" },
  ], "");
  assert.deepEqual(ranked.slice(0, 3).map((exercise) => exercise.id), ["pull", "dip", "push"]);
});

test("search strength outranks an unrelated personal favorite", () => {
  const ranked = rankExercisesForPicker(exercises, [{ exerciseId: "push", workoutCount: 100, lastUsedAt: "2026-08-12T00:00:00.000Z" }], "pull");
  assert.deepEqual(ranked.map((exercise) => exercise.id), ["pull"]);
});

test("new users receive a deterministic canonical fallback", () => {
  assert.deepEqual(rankExercisesForPicker(exercises, [], "").map((exercise) => exercise.id), ["chin", "pull", "dip", "push"]);
});
