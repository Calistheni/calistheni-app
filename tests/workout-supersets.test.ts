import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentSupersetRoundEntries,
  getNextSupersetRoundIndex,
  getNextSupersetSetDraft,
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

test("routine preset metadata does not cap an open-ended superset", () => {
  const exercises = [
    { id: "pull-up", sets: [{ completed: true }] },
    { id: "dip", sets: [{ completed: true }] },
  ];

  assert.deepEqual(
    getSupersetRoundProgress(exercises, { hardRoundLimit: null }),
    {
      currentRound: 2,
      totalRounds: 2,
      completedRounds: 1,
      complete: false,
      openEnded: true,
    }
  );
  assert.equal(getNextSupersetRoundIndex(exercises), 1);
  assert.deepEqual(getCurrentSupersetRoundEntries(exercises), []);
});

test("an explicit hard limit is the only final completion condition", () => {
  const exercises = [
    {
      sets: [
        { completed: true, supersetRoundIndex: 0 },
        { completed: true, supersetRoundIndex: 1 },
        { completed: true, supersetRoundIndex: 2 },
      ],
    },
    {
      sets: [
        { completed: true, supersetRoundIndex: 0 },
        { completed: true, supersetRoundIndex: 1 },
        { completed: true, supersetRoundIndex: 2 },
      ],
    },
  ];

  assert.deepEqual(
    getSupersetRoundProgress(exercises, { hardRoundLimit: 3 }),
    {
      currentRound: 3,
      totalRounds: 3,
      completedRounds: 3,
      complete: true,
      openEnded: false,
    }
  );
  assert.equal(getNextSupersetRoundIndex(exercises, 3), null);
});

test("planned placeholders are consumed before the latest result is reused", () => {
  const sets = [
    { completed: true, reps: 10 },
    { completed: false, reps: 8 },
    { completed: false, reps: 6 },
  ];

  assert.deepEqual(getNextSupersetSetDraft(sets), {
    setIndex: 1,
    source: sets[1],
  });

  const completedSets = sets.map((set) => ({ ...set, completed: true }));
  assert.deepEqual(getNextSupersetSetDraft(completedSets), {
    setIndex: -1,
    source: completedSets[2],
  });
});

test("different preset counts safely fall back per exercise", () => {
  const pullUpSets = [
    { completed: true, reps: 10 },
    { completed: true, reps: 8 },
    { completed: false, reps: 6 },
  ];
  const dipSets = [
    { completed: true, reps: 15 },
    { completed: true, reps: 12 },
  ];

  assert.deepEqual(getNextSupersetSetDraft(pullUpSets), {
    setIndex: 2,
    source: pullUpSets[2],
  });
  assert.deepEqual(getNextSupersetSetDraft(dipSets), {
    setIndex: -1,
    source: dipSets[1],
  });
});

test("legacy plannedRounds values remain informational without a hard limit", () => {
  const legacySuperset = {
    plannedRounds: 1,
    hardRoundLimit: null,
  };
  const exercises = [
    { sets: [{ completed: true, supersetRoundIndex: 0 }] },
    { sets: [{ completed: true, supersetRoundIndex: 0 }] },
  ];

  assert.deepEqual(
    getSupersetRoundProgress(exercises, {
      hardRoundLimit: legacySuperset.hardRoundLimit,
    }),
    {
    currentRound: 2,
    totalRounds: 2,
    completedRounds: 1,
    complete: false,
    openEnded: true,
  }
  );
});
