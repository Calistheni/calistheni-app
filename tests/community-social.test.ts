import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("community engagement schema keeps likes unique and comments indexed", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model WorkoutLike[\s\S]*@@id\(\[workoutId, userId\]\)/);
  assert.match(schema, /model WorkoutComment[\s\S]*@@index\(\[workoutId, createdAt\]\)/);
  assert.match(schema, /enum WorkoutNotificationType[\s\S]*WORKOUT_COMMENTED/);
  assert.match(schema, /model WorkoutNotification/);
});

test("copy route preserves workout structure but resets completion", async () => {
  const source = await readFile(new URL("../app/api/workouts/[id]/copy/route.ts", import.meta.url), "utf8");
  assert.match(source, /completedAt: null/);
  assert.match(source, /completed: false/);
  assert.match(source, /supersets:/);
});

test("social APIs require authentication and use paginated comments", async () => {
  const comments = await readFile(new URL("../app/api/workouts/[id]/comments/route.ts", import.meta.url), "utf8");
  const likes = await readFile(new URL("../app/api/workouts/[id]/like/route.ts", import.meta.url), "utf8");
  assert.match(comments, /createUserUnauthorizedResponse/);
  assert.match(comments, /take: pageSize \+ 1/);
  assert.match(likes, /workoutLike\.create/);
  assert.match(likes, /workoutNotification\.create/);
});
