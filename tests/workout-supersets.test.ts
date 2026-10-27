import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentSupersetRoundEntries,
  getNextSupersetRoundIndex,
  getNextSupersetSetDraft,
  getSupersetRoundProgress,
  getSupersetDisplayLabel,
  getSupersetLetter,
  getSupersetRenderEntries,
  getSupersetMembershipSortableId,
  initializeNextSupersetSetDraft,
  reorderSupersetMembershipIds,
} from "../lib/workout-supersets.ts";
import { calculateActiveWorkoutVolumeKg } from "../lib/active-workout-volume.ts";
import type { WorkoutSetInput } from "../types/workout.ts";

function workoutSet(
  values: Partial<WorkoutSetInput> = {}
): WorkoutSetInput {
  return {
    reps: null,
    weight: null,
    durationSeconds: null,
    distanceMeters: null,
    steps: null,
    floors: null,
    rpe: null,
    notes: null,
    completed: false,
    supersetRoundIndex: null,
    supersetRoundId: null,
    ...values,
  };
}

test("superset labels follow ordered group position and never legacy saved labels", () => {
  const groups = ["group-a", "group-b", "group-c"].map((key) => ({ key, label: "Superset A" }));
  assert.deepEqual(groups.map((group, index) => getSupersetDisplayLabel(group, index)), ["Superset A", "Superset B", "Superset C"]);
  assert.equal(getSupersetLetter(25), "Z");
  assert.equal(getSupersetLetter(26), "AA");
  assert.equal(getSupersetLetter(27), "AB");
});

test("superset render entries use stable unique group and exercise keys", () => {
  const exercises = [{ localId: "pull-up" }, { localId: "dip" }, { localId: "row" }];
  const supersets = [
    { key: "group-a", exerciseLocalIds: ["pull-up", "dip"] },
    { key: "group-b", exerciseLocalIds: ["pull-up", "row"] },
  ];
  const entries = getSupersetRenderEntries(supersets, exercises);
  assert.deepEqual(entries.map((entry) => entry.key), ["superset-group-group-a", "superset-group-group-b"]);
  assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length);
  assert.deepEqual(getSupersetRenderEntries([...supersets].reverse(), exercises).map((entry) => entry.key), ["superset-group-group-b", "superset-group-group-a"]);
  assert.deepEqual(getSupersetRenderEntries([supersets[1]], exercises).map((entry) => entry.key), ["superset-group-group-b", "exercise-dip"]);
});

test("reorders only one normalized superset membership list with stable sortable IDs", () => {
  const groupA = ["pull-up", "dip", "push-up"];
  const groupB = ["dip", "row"];
  assert.equal(getSupersetMembershipSortableId("group-a", "dip"), "superset-membership:group-a:dip");
  assert.equal(getSupersetMembershipSortableId("group-a", "dip") === getSupersetMembershipSortableId("group-b", "dip"), false);
  assert.deepEqual(reorderSupersetMembershipIds(groupA, "push-up", "dip"), ["pull-up", "push-up", "dip"]);
  assert.deepEqual(groupB, ["dip", "row"]);
});

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
    setNumber: 2,
    source: sets[1],
  });

  const completedSets = sets.map((set) => ({ ...set, completed: true }));
  assert.deepEqual(getNextSupersetSetDraft(completedSets), {
    setIndex: -1,
    setNumber: 4,
    source: completedSets[2],
  });
});

test("superset drafts inherit every supported field from the same exercise", () => {
  const cases = [
    {
      trackingType: "BODYWEIGHT_REPS" as const,
      previous: { reps: 10 },
      expected: { reps: 10, weight: null },
    },
    {
      trackingType: "WEIGHTED_BODYWEIGHT" as const,
      previous: { reps: 10, weight: 10 },
      expected: { reps: 10, weight: 10 },
    },
    {
      trackingType: "EXTERNAL_WEIGHT" as const,
      previous: { reps: 8, weight: 80 },
      expected: { reps: 8, weight: 80 },
    },
    {
      trackingType: "DURATION" as const,
      previous: { durationSeconds: 60 },
      expected: { durationSeconds: 60 },
    },
    {
      trackingType: "DISTANCE_DURATION" as const,
      previous: { durationSeconds: 45, distanceMeters: 100 },
      expected: { durationSeconds: 45, distanceMeters: 100 },
    },
    {
      trackingType: "STEPS_DISTANCE_DURATION" as const,
      previous: { durationSeconds: 300, distanceMeters: 400, steps: 600 },
      expected: { durationSeconds: 300, distanceMeters: 400, steps: 600 },
    },
    {
      trackingType: "FLOORS_DISTANCE_DURATION" as const,
      previous: { durationSeconds: 240, distanceMeters: 120, floors: 12 },
      expected: { durationSeconds: 240, distanceMeters: 120, floors: 12 },
    },
    {
      trackingType: "WEIGHT_DISTANCE_DURATION" as const,
      previous: { weight: 25, durationSeconds: 90, distanceMeters: 50 },
      expected: { weight: 25, durationSeconds: 90, distanceMeters: 50 },
    },
  ];

  for (const { trackingType, previous, expected } of cases) {
    const result = initializeNextSupersetSetDraft(
      [
        workoutSet({
          ...previous,
          completed: true,
          supersetRoundIndex: 0,
          supersetRoundId: "group-a:round-1",
        }),
        workoutSet(),
      ],
      trackingType,
      "group-a"
    );

    assert.equal(result.setIndex, 1);
    assert.equal(result.setNumber, 2);
    assert.equal(result.set.completed, false);
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(expected).map((field) => [
          field,
          result.set[field as keyof WorkoutSetInput],
        ])
      ),
      expected
    );
  }
});

test("each mixed-superset exercise inherits only its own values", () => {
  const pullUp = initializeNextSupersetSetDraft(
    [
      workoutSet({ reps: 8, weight: 15, completed: true, supersetRoundId: "mixed:1" }),
      workoutSet(),
    ],
    "WEIGHTED_BODYWEIGHT",
    "mixed"
  );
  const dip = initializeNextSupersetSetDraft(
    [
      workoutSet({ reps: 8, weight: 20, completed: true, supersetRoundId: "mixed:1" }),
      workoutSet(),
    ],
    "WEIGHTED_BODYWEIGHT",
    "mixed"
  );
  const plank = initializeNextSupersetSetDraft(
    [
      workoutSet({ durationSeconds: 60, completed: true, supersetRoundId: "mixed:1" }),
      workoutSet(),
    ],
    "DURATION",
    "mixed"
  );

  assert.deepEqual([pullUp.set.reps, pullUp.set.weight], [8, 15]);
  assert.deepEqual([dip.set.reps, dip.set.weight], [8, 20]);
  assert.deepEqual(
    [plank.set.reps, plank.set.weight, plank.set.durationSeconds],
    [null, null, 60]
  );
});

test("an existing incomplete slot preserves edits and fills only its missing fields", () => {
  const sets = [
    workoutSet({
      reps: 10,
      weight: 10,
      completed: true,
      supersetRoundId: "group-a:round-1",
    }),
    workoutSet({ reps: 8, weight: null, notes: "manual edit" }),
  ];

  const first = initializeNextSupersetSetDraft(
    sets,
    "WEIGHTED_BODYWEIGHT",
    "group-a"
  );
  const second = initializeNextSupersetSetDraft(
    sets,
    "WEIGHTED_BODYWEIGHT",
    "group-a"
  );

  assert.deepEqual(
    { reps: first.set.reps, weight: first.set.weight, notes: first.set.notes },
    { reps: 8, weight: 10, notes: "manual edit" }
  );
  assert.deepEqual(second, first);
  assert.equal(sets[1]?.weight, null);
});

test("appended, restored, and routine-placeholder rounds use the same initializer", () => {
  const restoredSets = JSON.parse(
    JSON.stringify([
      workoutSet({
        reps: 10,
        weight: 12.5,
        completed: true,
        supersetRoundId: "routine:round-1",
      }),
    ])
  ) as WorkoutSetInput[];
  const appended = initializeNextSupersetSetDraft(
    restoredSets,
    "WEIGHTED_BODYWEIGHT",
    "routine"
  );
  assert.equal(appended.setIndex, -1);
  assert.deepEqual([appended.set.reps, appended.set.weight], [10, 12.5]);

  const routinePlaceholder = initializeNextSupersetSetDraft(
    [...restoredSets, workoutSet({ reps: 6 })],
    "WEIGHTED_BODYWEIGHT",
    "routine"
  );
  assert.deepEqual(
    [routinePlaceholder.set.reps, routinePlaceholder.set.weight],
    [6, 12.5]
  );
});

test("the immediately preceding completed round wins without mutating earlier rounds", () => {
  const sets = [
    workoutSet({ reps: 10, weight: 10, completed: true, supersetRoundId: "group-a:1" }),
    workoutSet({ reps: 9, weight: 15, completed: true, supersetRoundId: "group-a:2" }),
    workoutSet(),
  ];
  const snapshot = structuredClone(sets);
  const result = initializeNextSupersetSetDraft(
    sets,
    "WEIGHTED_BODYWEIGHT",
    "group-a"
  );

  assert.deepEqual([result.set.reps, result.set.weight], [9, 15]);
  assert.deepEqual(sets, snapshot);
});

test("unrelated manual or differently scoped sets are not inherited", () => {
  const result = initializeNextSupersetSetDraft(
    [
      workoutSet({ reps: 5, weight: 100, completed: true }),
      workoutSet({
        reps: 7,
        weight: 30,
        completed: true,
        supersetRoundId: "other:round-1",
      }),
      workoutSet(),
    ],
    "EXTERNAL_WEIGHT",
    "target"
  );

  assert.deepEqual([result.set.reps, result.set.weight], [null, null]);
});

test("legacy rounds inherit safely while a new exercise without history stays empty", () => {
  const legacy = initializeNextSupersetSetDraft(
    [
      workoutSet({
        durationSeconds: 60,
        completed: true,
        supersetRoundIndex: 0,
      }),
      workoutSet(),
    ],
    "DURATION",
    "legacy-group"
  );
  const newExercise = initializeNextSupersetSetDraft(
    [workoutSet()],
    "DURATION",
    "legacy-group"
  );

  assert.equal(legacy.set.durationSeconds, 60);
  assert.equal(newExercise.set.durationSeconds, null);
});

test("suggested weighted-bodyweight values remain incomplete and retain added-weight semantics", () => {
  const suggestion = initializeNextSupersetSetDraft(
    [
      workoutSet({
        reps: 10,
        weight: 10,
        completed: true,
        supersetRoundId: "weighted:round-1",
      }),
    ],
    "WEIGHTED_BODYWEIGHT",
    "weighted"
  );

  assert.equal(suggestion.set.completed, false);
  assert.equal(suggestion.set.weight, 10);
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [{
        exerciseId: "weighted-pull-up",
        trackingType: "WEIGHTED_BODYWEIGHT",
        bodyweightLoadFactor: 1,
        sets: [suggestion.set],
      }],
      userBodyweightKg: 90,
    }),
    0
  );

  const completedSuggestion = { ...suggestion.set, completed: true };
  assert.equal(
    calculateActiveWorkoutVolumeKg({
      exercises: [{
        exerciseId: "weighted-pull-up",
        trackingType: "WEIGHTED_BODYWEIGHT",
        bodyweightLoadFactor: 1,
        sets: [completedSuggestion],
      }],
      userBodyweightKg: 90,
    }),
    1_000
  );
  assert.equal(suggestion.set.weight, 10);
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
    setNumber: 3,
    source: pullUpSets[2],
  });
  assert.deepEqual(getNextSupersetSetDraft(dipSets), {
    setIndex: -1,
    setNumber: 3,
    source: dipSets[1],
  });
});

test("manual sets do not advance a superset round and set numbers stay exercise-specific", () => {
  const exercises = [
    {
      id: "pull-up",
      sets: [
        { completed: true, supersetRoundId: "round-1" },
        { completed: true, supersetRoundId: "round-2" },
      ],
    },
    {
      id: "dip",
      sets: [
        { completed: true, supersetRoundId: "round-1" },
        { completed: true, supersetRoundId: "round-2" },
        { completed: true, supersetRoundId: null },
      ],
    },
  ];

  assert.equal(getSupersetRoundProgress(exercises).completedRounds, 2);
  assert.equal(getNextSupersetSetDraft(exercises[0].sets).setNumber, 3);
  assert.equal(getNextSupersetSetDraft(exercises[1].sets).setNumber, 4);
});

test("a first appended superset set is always presented as Set 1", () => {
  assert.equal(getNextSupersetSetDraft([]).setNumber, 1);
});

test("round identities are scoped to their superset when exercises are shared", () => {
  const pullUpAndDip = [
    {
      sets: [{ completed: true, supersetRoundId: "superset-a:round-1" }],
    },
    {
      sets: [{ completed: true, supersetRoundId: "superset-a:round-1" }],
    },
  ];

  assert.equal(
    getSupersetRoundProgress(pullUpAndDip, { supersetKey: "superset-a" })
      .completedRounds,
    1
  );
  assert.equal(
    getSupersetRoundProgress(pullUpAndDip, { supersetKey: "superset-b" })
      .completedRounds,
    0
  );
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
