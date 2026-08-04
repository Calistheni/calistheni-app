import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupplementCalendarIntensity,
  getTrainingActivityCellClass,
  getTrainingActivityIntensity,
  getWorkoutCalendarIntensity,
  matchesTrainingActivityFilter,
  WORKOUT_INTENSITY_CLASS,
} from "../lib/training-activity-calendar.ts";

const empty = { workoutCount: 0, supplementScheduledCount: 0, supplementCompletedCount: 0 };
const workoutOnly = { workoutCount: 1, supplementScheduledCount: 0, supplementCompletedCount: 0 };
const supplementsOnly = { workoutCount: 0, supplementScheduledCount: 2, supplementCompletedCount: 2 };
const both = { workoutCount: 1, supplementScheduledCount: 2, supplementCompletedCount: 2 };
const strongBoth = { workoutCount: 2, supplementScheduledCount: 2, supplementCompletedCount: 2 };

test("all activity gives one workout and any supplement intake the identical blue baseline", () => {
  assert.equal(getTrainingActivityIntensity(empty, "all"), 0);
  assert.equal(getTrainingActivityIntensity(supplementsOnly, "all"), 1);
  assert.equal(getTrainingActivityIntensity(workoutOnly, "all"), 1);
  assert.equal(getTrainingActivityCellClass(supplementsOnly, "all"), getTrainingActivityCellClass(workoutOnly, "all"));
  assert.equal(getTrainingActivityIntensity({ workoutCount: 0, supplementScheduledCount: 5, supplementCompletedCount: 5 }, "all"), 1);
  assert.equal(getTrainingActivityIntensity(both, "all"), 2);
  assert.equal(getTrainingActivityIntensity(strongBoth, "all"), 3);
  assert.equal(getTrainingActivityIntensity({ ...strongBoth, workoutCount: 3 }, "all"), 4);
  assert.equal(WORKOUT_INTENSITY_CLASS[2], "bg-primary/55");
  assert.doesNotMatch(getTrainingActivityCellClass(both, "all"), /red|clip-path/);
});

test("workout filter preserves session intensity and dims supplement-only days", () => {
  assert.equal(getWorkoutCalendarIntensity(1), 1);
  assert.equal(getWorkoutCalendarIntensity(3), 3);
  assert.equal(matchesTrainingActivityFilter(workoutOnly, "workouts"), true);
  assert.equal(matchesTrainingActivityFilter(both, "workouts"), true);
  assert.equal(matchesTrainingActivityFilter(supplementsOnly, "workouts"), false);
  assert.equal(getTrainingActivityIntensity({ ...both, workoutCount: 2 }, "workouts"), 2);
  assert.equal(getTrainingActivityCellClass(supplementsOnly, "workouts"), "bg-muted/30 opacity-45");
});

test("supplement filter is binary while both filter scales from workout count", () => {
  assert.equal(getSupplementCalendarIntensity({ scheduled: 3, completed: 0 }), 0);
  assert.equal(getSupplementCalendarIntensity({ scheduled: 3, completed: 1 }), 1);
  assert.equal(getSupplementCalendarIntensity({ scheduled: 3, completed: 3 }), 1);
  assert.equal(getSupplementCalendarIntensity({ scheduled: 0, completed: 1 }), 1);
  assert.equal(matchesTrainingActivityFilter(supplementsOnly, "supplements"), true);
  assert.equal(matchesTrainingActivityFilter(workoutOnly, "supplements"), false);
  assert.equal(matchesTrainingActivityFilter(both, "both"), true);
  assert.equal(matchesTrainingActivityFilter(workoutOnly, "both"), false);
  assert.equal(getTrainingActivityIntensity(both, "both"), 2);
  assert.equal(getTrainingActivityIntensity(strongBoth, "both"), 3);
  assert.equal(getTrainingActivityIntensity({ ...strongBoth, workoutCount: 3 }, "both"), 4);
});

test("calendar imports only the current centralized activity helpers", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../components/home/TrainingActivityCalendar.tsx", import.meta.url), "utf8");
  assert.match(source, /getTrainingActivityCellClass/);
  assert.match(source, /getTrainingActivityIntensity/);
  assert.doesNotMatch(source, /getTrainingCalendarCellState/);
});
