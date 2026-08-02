import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRoutineSupersetMemberships,
  UnresolvedRoutineExerciseError,
} from "../lib/routine-superset-mapping.ts";
import { readFileSync } from "node:fs";

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

test("routine superset creation confirms each additional ordered group", () => {
  const builder = readFileSync(new URL("../components/routines/RoutineBuilder.tsx", import.meta.url), "utf8");
  const routines = readFileSync(new URL("../lib/routines.ts", import.meta.url), "utf8");
  assert.match(builder, /Create \{nextSupersetLabel\}\?/);
  assert.match(builder, /Create \{nextSupersetLabel\}/);
  assert.match(builder, /separate from \{previousSupersetLabel\}/);
  assert.match(builder, /const nextSupersetLabel = getSupersetDisplayLabel\(\{ label: null \}, supersets\.length\)/);
  assert.match(builder, /item\.exerciseClientIds\.includes\(selectedExercise\.localId\)/);
  assert.match(routines, /existingSupersetIds\.has\(superset\.key\)[\s\S]*\? superset\.key/);
});

test("routine superset members use namespaced sortable identities and membership-only reorder", () => {
  const builder = readFileSync(new URL("../components/routines/RoutineBuilder.tsx", import.meta.url), "utf8");
  assert.match(builder, /<SortableExerciseList/);
  assert.match(builder, /getSupersetMembershipSortableId\(primarySuperset\.key, selectedExercise\.localId\)/);
  assert.match(builder, /reorderSupersetMembershipIds\(superset\.exerciseClientIds, activeId, overId\)/);
});
