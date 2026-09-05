import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatWorkoutDateTime,
  formatWorkoutRelativeTime,
} from "@/lib/workout-date-time";

const root = new URL("../", import.meta.url);

test("an absolute workout timestamp displays in the requested local timezone", () => {
  const instant = "2026-09-05T17:00:00.000Z";
  const utc = formatWorkoutDateTime(instant, {
    locale: "en-GB",
    timeZone: "UTC",
  });
  const sofia = formatWorkoutDateTime(instant, {
    locale: "en-GB",
    timeZone: "Europe/Sofia",
  });

  assert.match(utc, /17:00:00/);
  assert.match(sofia, /20:00:00/);
  assert.equal(
    formatWorkoutDateTime("2026-09-05T20:00:00"),
    "Invalid date",
    "timezone-less workout timestamps must not be interpreted ambiguously"
  );
});

test("workout local-time formatting follows winter DST without hardcoded offsets", () => {
  const winterInstant = "2026-01-05T18:00:00.000Z";
  assert.match(
    formatWorkoutDateTime(winterInstant, {
      locale: "en-GB",
      timeZone: "Europe/Sofia",
    }),
    /20:00:00/
  );
});

test("community relative workout time stays instant-based", () => {
  assert.equal(
    formatWorkoutRelativeTime("2026-09-05T17:00:00.000Z", Date.parse("2026-09-05T17:33:00.000Z")),
    "33m"
  );
});

test("workout writes and API mapping preserve canonical ISO instants", async () => {
  const [builder, workouts] = await Promise.all([
    readFile(new URL("components/workouts/WorkoutBuilder.tsx", root), "utf8"),
    readFile(new URL("lib/workouts.ts", root), "utf8"),
  ]);

  assert.match(builder, /startedAt:[\s\S]*new Date\([\s\S]*\)\.toISOString\(\)/);
  assert.match(builder, /completedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(workouts, /startedAt: workout\.startedAt\.toISOString\(\)/);
  assert.match(workouts, /completedAt: workout\.completedAt\?\.toISOString\(\) \?\? null/);
  assert.match(workouts, /startedAt: payload\.startedAt \? new Date\(payload\.startedAt\) : new Date\(\)/);
});

test("workout timestamp displays are formatted only after reaching the browser", async () => {
  const [component, detail, publicProfile, history, home, feed, records, recordDetail] = await Promise.all([
    readFile(new URL("components/workouts/LocalWorkoutDateTime.tsx", root), "utf8"),
    readFile(new URL("app/workouts/[id]/page.tsx", root), "utf8"),
    readFile(new URL("app/users/[id]/page.tsx", root), "utf8"),
    readFile(new URL("app/workouts/page.tsx", root), "utf8"),
    readFile(new URL("app/home/page.tsx", root), "utf8"),
    readFile(new URL("app/feed/page.tsx", root), "utf8"),
    readFile(new URL("app/profile/records/page.tsx", root), "utf8"),
    readFile(new URL("app/profile/records/[exerciseId]/page.tsx", root), "utf8"),
  ]);

  assert.match(component, /^"use client";/);
  assert.match(component, /useSyncExternalStore/);
  assert.match(component, /\(\) => false/);
  assert.match(component, /formatWorkoutDateTime\(value, \{ format \}\)/);
  for (const page of [detail, publicProfile, history, home, records, recordDetail]) {
    assert.match(page, /<LocalWorkoutDateTime/);
  }
  assert.match(feed, /<LocalWorkoutRelativeTime/);
  assert.doesNotMatch(detail, /new Date\(detail\.startedAt\)\.toLocaleString/);
  assert.doesNotMatch(publicProfile, /new Date\(workout\.startedAt\)\.toLocaleString/);
});
