import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRoutineSupersetMemberships,
  UnresolvedRoutineExerciseError,
} from "../lib/routine-superset-mapping.ts";

test("maps unsaved request exercise keys to persisted routine exercise IDs", () => {
  const result = resolveRoutineSupersetMemberships(
    [
      {
        key: "temp-superset-a",
        exerciseClientIds: ["temp-pull-up", "temp-dip"],
      },
    ],
    new Map([
      ["temp-pull-up", 101],
      ["temp-dip", 102],
    ])
  );

  assert.deepEqual(result, [
    {
      requestSupersetKey: "temp-superset-a",
      members: [
        {
          clientExerciseId: "temp-pull-up",
          persistedExerciseId: 101,
          position: 0,
        },
        {
          clientExerciseId: "temp-dip",
          persistedExerciseId: 102,
          position: 1,
        },
      ],
    },
  ]);
});

test("maps mixed persisted and newly added draft members by request key", () => {
  const [result] = resolveRoutineSupersetMemberships(
    [
      {
        key: "new-mixed-group",
        exerciseClientIds: ["routine-exercise-42", "temp-dip"],
      },
    ],
    new Map([
      ["routine-exercise-42", 201],
      ["temp-dip", 202],
    ])
  );

  assert.deepEqual(
    result.members.map((member) => member.persistedExerciseId),
    [201, 202]
  );
});

test("never passes an unresolved temporary key through as a foreign key", () => {
  assert.throws(
    () =>
      resolveRoutineSupersetMemberships(
        [
          {
            key: "temp-superset-a",
            exerciseClientIds: ["temp-pull-up", "temp-missing"],
          },
        ],
        new Map([["temp-pull-up", 101]])
      ),
    UnresolvedRoutineExerciseError
  );
});
