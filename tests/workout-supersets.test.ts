import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentSupersetRoundEntries,
  getSupersetRoundProgress,
} from "../lib/workout-supersets.ts";

test("derives the current round from matching set positions", () => {
  const exercises = [
    { id: "pull-up", sets: [{ completed: true }, { completed: false }] },
    { id: "dip", sets: [{ completed: true }, { completed: false }] },
  ];

  assert.deepEqual(getSupersetRoundProgress(exercises), {
    currentRound: 2,
    totalRounds: 2,
    completedRounds: 1,
    complete: false,
    openEnded: true,
  });
  assert.deepEqual(
    getCurrentSupersetRoundEntries(exercises).map(
      ({ exercise, setIndex }) => [exercise.id, setIndex]
    ),
    [
      ["pull-up", 1],
      ["dip", 1],
    ]
  );
});

test("omits an exercise that has no set in a later round", () => {
  const exercises = [
    {
      id: "pull-up",
      sets: [
        { completed: true },
        { completed: true },
        { completed: true },
      ],
    },
    {
      id: "dip",
      sets: [
        { completed: true },
        { completed: true },
        { completed: true },
        { completed: false },
      ],
    },
  ];

  assert.equal(getSupersetRoundProgress(exercises).currentRound, 4);
  assert.deepEqual(
    getCurrentSupersetRoundEntries(exercises).map(
      ({ exercise, setIndex }) => [exercise.id, setIndex]
    ),
    [["dip", 3]]
  );
});

test("reports a final completed state with no editable entries", () => {
  const exercises = [
    { id: "pull-up", sets: [{ completed: true }] },
    { id: "dip", sets: [{ completed: true }] },
  ];

  assert.deepEqual(getSupersetRoundProgress(exercises, 1), {
    currentRound: 1,
    totalRounds: 1,
    completedRounds: 1,
    complete: true,
    openEnded: false,
  });
  assert.deepEqual(getCurrentSupersetRoundEntries(exercises), []);
});
