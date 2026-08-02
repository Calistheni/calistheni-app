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
  reorderSupersetMembershipIds,
} from "../lib/workout-supersets.ts";

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
