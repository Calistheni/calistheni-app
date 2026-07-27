import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWeeklyReport,
  getWeeklyReportComparison,
} from "./weekly-report.ts";

const set = (id, completed, reps = 10) => ({
  id,
  completed,
  reps,
  primaryMuscle: "Quadriceps",
  secondaryMuscles: ["Glutes", "Hamstrings"],
});

test("weekly report counts only finished workouts and completed sets", () => {
  const report = calculateWeeklyReport({
    weekStart: "2026-07-27T00:00:00.000Z",
    workouts: [
      {
        id: 1,
        startedAt: "2026-07-27T08:00:00.000Z",
        completedAt: "2026-07-27T09:00:00.000Z",
        totalVolumeKg: 120,
        sets: [set(1, true), set(2, false), set(3, true, 8)],
      },
      {
        id: 2,
        startedAt: "2026-07-28T08:00:00.000Z",
        completedAt: null,
        totalVolumeKg: 500,
        sets: [set(4, true)],
      },
    ],
  });

  assert.equal(report.current.workouts, 1);
  assert.equal(report.current.completedSets, 2);
  assert.equal(report.current.totalReps, 18);
  assert.equal(report.current.totalVolumeKg, 120);
  assert.equal(report.current.activeDays, 1);
  assert.equal(report.current.durationSeconds, 3600);
  assert.equal(report.current.mostTrainedMuscle?.muscle, "Legs");
  assert.equal(report.current.mostTrainedMuscle?.workloadSets, 2);
});

test("weekly report compares against the previous Monday-to-Sunday period", () => {
  const report = calculateWeeklyReport({
    weekStart: "2026-07-27T00:00:00.000Z",
    workouts: [
      {
        id: 1,
        startedAt: "2026-07-20T08:00:00.000Z",
        completedAt: "2026-07-20T09:00:00.000Z",
        totalVolumeKg: 100,
        sets: [set(1, true)],
      },
      {
        id: 2,
        startedAt: "2026-07-27T08:00:00.000Z",
        completedAt: "2026-07-27T09:00:00.000Z",
        totalVolumeKg: 150,
        sets: [set(2, true), set(3, true)],
      },
    ],
  });

  assert.equal(report.previous.completedSets, 1);
  assert.deepEqual(report.comparisons.completedSets, {
    kind: "increase",
    percentage: 100,
  });
});

test("zero previous activity produces copy-safe comparison data", () => {
  assert.deepEqual(getWeeklyReportComparison(2, 0), {
    kind: "new-activity",
    percentage: null,
  });
  assert.deepEqual(getWeeklyReportComparison(0, 0), {
    kind: "unchanged",
    percentage: null,
  });
});
