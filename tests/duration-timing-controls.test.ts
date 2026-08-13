import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builderPath = new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url);

test("duration controls live at the exercise level while TIME stays an input-only table cell", async () => {
  const source = await readFile(builderPath, "utf8");

  assert.match(source, /function openExerciseTimingTools/);
  assert.match(source, /isDurationFieldVisible\(exercise\.trackingType\) \? \(/);
  assert.match(source, /Open timing tools for \$\{exercise\.name\}/);
  assert.match(source, /key=\{column\.metric\} className="min-w-0"/);
  assert.doesNotMatch(source, /Choose duration entry method for \$\{exercise\.name\} set/);
});

test("exercise-level timing targets the active set or the first incomplete set", async () => {
  const source = await readFile(builderPath, "utf8");

  assert.match(source, /exerciseTimer\?\.exerciseLocalId === selectedExercise\.localId/);
  assert.match(source, /selectedExercise\.sets\.findIndex\(\(set\) => !set\.completed\)/);
});
