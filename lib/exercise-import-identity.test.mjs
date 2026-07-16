import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCanonicalExerciseUpsert,
  findExerciseByCanonicalSlug,
} from "./exercise-import-identity.mjs";
import { createExerciseSlug } from "./exercise-slug.mjs";

const originalLSit = {
  id: "l-sit-hold",
  slug: "l-sit-hold",
  name: "L-Sit",
};
const newLSitHold = {
  id: "floor-l-sit-hold",
  slug: "floor-l-sit-hold",
  name: "L-Sit Hold",
};

test("L-Sit and L-Sit Hold have distinct canonical identities", () => {
  assert.notEqual(createExerciseSlug("L-Sit"), createExerciseSlug("L-Sit Hold"));
  assert.notEqual(originalLSit.slug, newLSitHold.slug);
});

test("the L-Sit Hold import never targets the original L-Sit", () => {
  assert.equal(
    findExerciseByCanonicalSlug([originalLSit], newLSitHold.slug),
    null
  );

  const imported = applyCanonicalExerciseUpsert(
    [originalLSit],
    newLSitHold
  );

  assert.deepEqual(imported, [originalLSit, newLSitHold]);
});

test("re-running the import updates L-Sit Hold without duplicating it", () => {
  const existing = [originalLSit, newLSitHold];
  const imported = applyCanonicalExerciseUpsert(existing, {
    ...newLSitHold,
    bodyweightLoadFactor: 0.3,
  });

  assert.equal(imported.length, 2);
  assert.deepEqual(imported[0], originalLSit);
  assert.deepEqual(imported[1], {
    ...newLSitHold,
    bodyweightLoadFactor: 0.3,
  });
});
