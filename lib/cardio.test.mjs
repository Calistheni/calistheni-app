import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWeeklyCardioProgress,
  getWeeklyCardioProgressCopy,
  isCardioExercise,
  parseWeeklyCardioGoalMinutes,
} from "./cardio.ts";

const monday = "2026-07-27T00:00:00.000Z";
const now = "2026-07-30T12:00:00.000Z";

function cardioEntry(overrides = {}) {
  return {
    setId: 1,
    workoutId: 10,
    workoutTitle: "Cardio",
    exerciseId: "running",
    exerciseName: "Running",
    muscle: "Cardio",
    trackingType: "DISTANCE_DURATION",
    completedAt: "2026-07-27T08:00:00.000Z",
    durationSeconds: 900,
    completed: true,
    ...overrides,
  };
}

test("cardio classifier uses explicit metadata rather than exercise names", () => {
  assert.equal(
    isCardioExercise({
      muscle: "Cardio",
      trackingType: "DISTANCE_DURATION",
    }),
    true
  );
  assert.equal(
    isCardioExercise({ muscle: "Cardio", trackingType: "DURATION" }),
    true
  );
  assert.equal(
    isCardioExercise({
      muscle: "Abdominals",
      trackingType: "DURATION",
    }),
    false
  );
  assert.equal(
    isCardioExercise({ muscle: "Core", trackingType: "DURATION" }),
    false
  );
  assert.equal(
    isCardioExercise({ muscle: "Cardio", trackingType: "NOT_SELECTED" }),
    false
  );
  assert.equal(
    isCardioExercise({ muscle: "Cardio", trackingType: "EXTERNAL_WEIGHT" }),
    false
  );
});

test("Running, Cycling, and Jump Rope metadata count while timed holds do not", () => {
  for (const exercise of ["Running", "Cycling", "Jump Rope"]) {
    assert.equal(
      isCardioExercise({
        muscle: "Cardio",
        trackingType:
          exercise === "Jump Rope" ? "DURATION" : "DISTANCE_DURATION",
      }),
      true
    );
  }

  for (const exercise of ["Plank", "L-sit"]) {
    assert.equal(
      isCardioExercise({
        muscle: exercise === "Plank" ? "Abdominals" : "Core",
        trackingType: "DURATION",
      }),
      false
    );
  }
});

test("weekly progress sums completed cardio set duration without duplicates", () => {
  const progress = calculateWeeklyCardioProgress({
    now,
    goalMinutes: 60,
    entries: [
      cardioEntry(),
      cardioEntry(),
      cardioEntry({
        setId: 2,
        workoutId: 11,
        exerciseId: "jump-rope",
        exerciseName: "Jump Rope",
        trackingType: "DURATION",
        completedAt: "2026-07-29T18:00:00.000Z",
        durationSeconds: 1_200,
      }),
    ],
  });

  assert.equal(progress.completedSeconds, 2_100);
  assert.equal(progress.completedMinutes, 35);
  assert.equal(progress.progressPercent, 58);
  assert.equal(progress.remainingMinutes, 25);
  assert.equal(progress.exceededMinutes, 0);
  assert.equal(progress.sessions, 2);
  assert.equal(progress.activeDays, 2);
  assert.equal(progress.activities.length, 2);
  assert.equal(progress.weekStart, monday);
});

test("only current-week completed cardio entries with duration count", () => {
  const progress = calculateWeeklyCardioProgress({
    now,
    goalMinutes: 150,
    entries: [
      cardioEntry({ setId: 1 }),
      cardioEntry({ setId: 2, completed: false }),
      cardioEntry({ setId: 3, durationSeconds: null }),
      cardioEntry({
        setId: 4,
        completedAt: "2026-07-26T23:59:59.999Z",
      }),
      cardioEntry({
        setId: 5,
        completedAt: "2026-07-31T08:00:00.000Z",
      }),
      cardioEntry({
        setId: 6,
        muscle: "Abdominals",
        trackingType: "DURATION",
      }),
    ],
  });

  assert.equal(progress.completedMinutes, 15);
});

test("Monday begins the UTC fallback week and previous week is excluded", () => {
  const progress = calculateWeeklyCardioProgress({
    now: "2026-07-27T00:10:00.000Z",
    goalMinutes: 60,
    entries: [
      cardioEntry({
        setId: "sunday",
        completedAt: "2026-07-26T23:59:59.999Z",
      }),
      cardioEntry({
        setId: "monday",
        completedAt: "2026-07-27T00:00:00.000Z",
      }),
    ],
  });

  assert.equal(progress.completedMinutes, 15);
});

test("visual progress caps at 100 while actual exceeded minutes remain visible", () => {
  const progress = calculateWeeklyCardioProgress({
    now,
    goalMinutes: 10,
    entries: [cardioEntry({ durationSeconds: 1_500 })],
  });

  assert.equal(progress.completedMinutes, 25);
  assert.equal(progress.progressRatio, 1);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.remainingMinutes, 0);
  assert.equal(progress.exceededMinutes, 15);
  assert.equal(getWeeklyCardioProgressCopy(progress), "15 minutes above goal");
});

test("no-goal, zero, reached, and remaining copy states are explicit", () => {
  assert.equal(
    getWeeklyCardioProgressCopy({
      completedMinutes: 0,
      goalMinutes: null,
      remainingMinutes: 0,
      exceededMinutes: 0,
    }),
    "Set a weekly cardio goal"
  );
  assert.equal(
    getWeeklyCardioProgressCopy({
      completedMinutes: 0,
      goalMinutes: 60,
      remainingMinutes: 60,
      exceededMinutes: 0,
    }),
    "No cardio recorded this week."
  );
  assert.equal(
    getWeeklyCardioProgressCopy({
      completedMinutes: 60,
      goalMinutes: 60,
      remainingMinutes: 0,
      exceededMinutes: 0,
    }),
    "Weekly goal reached"
  );
  assert.equal(
    getWeeklyCardioProgressCopy({
      completedMinutes: 30,
      goalMinutes: 60,
      remainingMinutes: 30,
      exceededMinutes: 0,
    }),
    "30 minutes remaining"
  );
});

test("weekly cardio goal validation accepts only integers from 10 to 2000", () => {
  assert.equal(parseWeeklyCardioGoalMinutes(10), 10);
  assert.equal(parseWeeklyCardioGoalMinutes("150"), 150);
  assert.equal(parseWeeklyCardioGoalMinutes(2_000), 2_000);
  assert.equal(parseWeeklyCardioGoalMinutes(0), null);
  assert.equal(parseWeeklyCardioGoalMinutes(-10), null);
  assert.equal(parseWeeklyCardioGoalMinutes(2_001), null);
  assert.equal(parseWeeklyCardioGoalMinutes(60.5), null);
});
