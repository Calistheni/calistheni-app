import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("normalized superset migration is additive and backfills legacy memberships", async () => {
  const sql = await readFile(
    "prisma/migrations/20260729113000_normalize_superset_memberships/migration.sql",
    "utf8"
  );

  assert.match(sql, /CREATE TABLE "WorkoutSupersetExercise"/);
  assert.match(sql, /CREATE TABLE "WorkoutTemplateSupersetExercise"/);
  assert.match(sql, /ADD COLUMN "supersetRoundId" TEXT/);
  assert.match(sql, /WHERE "supersetId" IS NOT NULL/);
  assert.match(sql, /ON CONFLICT \("supersetId", "workoutExerciseId"\) DO NOTHING/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
