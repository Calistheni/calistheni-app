import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCurrentWorkoutStreak,
  calculateFourWeekGoalConsistency,
  countCurrentWeekCompletedWorkouts,
  groupCompletedWorkoutActivity,
  parseWeeklyWorkoutGoal,
} from "./home-dashboard.ts";

test("weekly goal validation accepts only whole values from 1 to 7", () => {
  for (let goal = 1; goal <= 7; goal += 1) {
    assert.equal(parseWeeklyWorkoutGoal(goal), goal);
    assert.equal(parseWeeklyWorkoutGoal(String(goal)), goal);
  }

  for (const invalid of [0, 8, 2.5, "", "three", null, undefined]) {
    assert.equal(parseWeeklyWorkoutGoal(invalid), null);
  }
});

test("weekly progress counts only completed workouts in the current week", () => {
  const workouts = [
    { completedAt: "2026-07-13T08:00:00.000Z" },
    { completedAt: "2026-07-16T18:00:00.000Z" },
    { completedAt: "2026-07-12T18:00:00.000Z" },
    { completedAt: null },
  ];

  assert.equal(
    countCurrentWeekCompletedWorkouts(workouts, "2026-07-16T12:00:00.000Z"),
    2
  );
});

test("streak calculation follows consecutive calendar days", () => {
  const workouts = [
    { completedAt: "2026-07-15T08:00:00.000Z" },
    { completedAt: "2026-07-14T21:00:00.000Z" },
    { completedAt: "2026-07-13T10:00:00.000Z" },
    { completedAt: "2026-07-11T10:00:00.000Z" },
  ];

  assert.equal(
    calculateCurrentWorkoutStreak(workouts, "2026-07-16T12:00:00.000Z"),
    3
  );
});

test("activity calendar groups completed workouts by date", () => {
  const activity = groupCompletedWorkoutActivity([
    {
      completedAt: "2026-07-16T08:00:00.000Z",
      completedSets: 4,
      totalVolumeKg: 120,
    },
    {
      completedAt: "2026-07-16T20:00:00.000Z",
      completedSets: 3,
      totalVolumeKg: null,
    },
    {
      completedAt: "2026-07-15T08:00:00.000Z",
      completedSets: 2,
      totalVolumeKg: 80,
    },
    { completedAt: null, completedSets: 10, totalVolumeKg: 500 },
  ]);

  assert.deepEqual(activity, [
    {
      date: "2026-07-15",
      workoutCount: 1,
      completedSets: 2,
      totalVolumeKg: 80,
    },
    {
      date: "2026-07-16",
      workoutCount: 2,
      completedSets: 7,
      totalVolumeKg: 120,
    },
  ]);
});

test("four-week consistency uses completed weeks and the saved goal", () => {
  const workouts = [
    "2026-06-17",
    "2026-06-18",
    "2026-06-24",
    "2026-06-25",
    "2026-07-01",
    "2026-07-08",
    "2026-07-09",
  ].map((date) => ({ completedAt: `${date}T12:00:00.000Z` }));

  assert.deepEqual(
    calculateFourWeekGoalConsistency({
      workouts,
      weeklyGoal: 2,
      now: "2026-07-16T12:00:00.000Z",
      historyStart: "2026-01-01T00:00:00.000Z",
    }),
    { metWeeks: 3, totalWeeks: 4, percentage: 75 }
  );
});

test("empty workout data produces honest empty states", () => {
  assert.equal(countCurrentWeekCompletedWorkouts([], "2026-07-16"), 0);
  assert.equal(calculateCurrentWorkoutStreak([], "2026-07-16"), 0);
  assert.deepEqual(groupCompletedWorkoutActivity([]), []);
  assert.equal(
    calculateFourWeekGoalConsistency({
      workouts: [],
      weeklyGoal: 3,
      now: "2026-07-16",
      historyStart: "2026-07-01",
    }),
    null
  );
});
