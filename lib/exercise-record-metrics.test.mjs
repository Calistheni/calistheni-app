import assert from "node:assert/strict";
import test from "node:test";

import {
  EXERCISE_RECORD_CHART_COLOR,
  getExerciseMetricDefinitions,
  getExercisePersonalRecords,
  getExerciseRecordHistory,
  getExerciseWorkoutMetrics,
} from "./exercise-record-metrics.ts";
import { calculateSetVolumeKg } from "./workout-volume.ts";

const EMPTY_SET = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  steps: null,
  floors: null,
};

const VOLUME_CALCULATOR = { calculateSetVolume: calculateSetVolumeKg };

test("the selected chart metric always uses the Calistheni primary blue", () => {
  assert.equal(EXERCISE_RECORD_CHART_COLOR, "var(--primary)");
});

function occurrence({
  workoutExerciseId = 1,
  workoutId = 1,
  startedAt = "2026-01-01T10:00:00.000Z",
  sets,
}) {
  return {
    workoutExerciseId,
    workoutId,
    workoutTitle: `Workout ${workoutId}`,
    startedAt,
    sets,
  };
}

test("max reps in one set and total workout reps stay separate", () => {
  const [performance] = getExerciseWorkoutMetrics({
    trackingType: "BODYWEIGHT_REPS",
    bodyweightLoadFactor: 1,
    userBodyweightKg: 80,
    ...VOLUME_CALCULATOR,
    occurrences: [
      occurrence({
        sets: [
          { ...EMPTY_SET, reps: 12 },
          { ...EMPTY_SET, reps: 10 },
          { ...EMPTY_SET, reps: 8 },
        ],
      }),
    ],
  });

  assert.equal(performance.values.maxRepsSet, 12);
  assert.equal(performance.values.totalReps, 30);
  assert.equal(performance.values.totalSets, 3);
});

test("multiple rows of the same exercise in one workout become one point", () => {
  const performances = getExerciseWorkoutMetrics({
    trackingType: "BODYWEIGHT_REPS",
    bodyweightLoadFactor: 1,
    userBodyweightKg: 80,
    ...VOLUME_CALCULATOR,
    occurrences: [
      occurrence({ sets: [{ ...EMPTY_SET, reps: 8 }] }),
      occurrence({
        workoutExerciseId: 2,
        sets: [{ ...EMPTY_SET, reps: 6 }],
      }),
    ],
  });

  assert.equal(performances.length, 1);
  assert.equal(performances[0].values.maxRepsSet, 8);
  assert.equal(performances[0].values.totalReps, 14);
});

test("weighted metrics include top weight, weighted reps, volume, and Epley 1RM", () => {
  const [performance] = getExerciseWorkoutMetrics({
    trackingType: "EXTERNAL_WEIGHT",
    bodyweightLoadFactor: null,
    userBodyweightKg: null,
    ...VOLUME_CALCULATOR,
    occurrences: [
      occurrence({
        sets: [
          { ...EMPTY_SET, reps: 5, weight: 100 },
          { ...EMPTY_SET, reps: 8, weight: 80 },
        ],
      }),
    ],
  });

  assert.equal(performance.values.maxWeight, 100);
  assert.equal(performance.values.maxWeightedReps, 8);
  assert.equal(performance.values.workoutVolume, 1_140);
  assert.equal(Math.round(performance.values.estimatedOneRepMax), 117);
});

test("duration and distance metrics adapt to timed exercises", () => {
  const performances = getExerciseWorkoutMetrics({
    trackingType: "DISTANCE_DURATION",
    bodyweightLoadFactor: null,
    userBodyweightKg: null,
    ...VOLUME_CALCULATOR,
    occurrences: [
      occurrence({
        sets: [
          { ...EMPTY_SET, durationSeconds: 60, distanceMeters: 400 },
          { ...EMPTY_SET, durationSeconds: 90, distanceMeters: 600 },
        ],
      }),
    ],
  });
  const [performance] = performances;
  const metricKeys = getExerciseMetricDefinitions(
    "DISTANCE_DURATION",
    performances
  ).map((metric) => metric.key);

  assert.equal(performance.values.longestDuration, 90);
  assert.equal(performance.values.totalDuration, 150);
  assert.equal(performance.values.longestDistance, 600);
  assert.equal(performance.values.totalDistance, 1_000);
  assert.equal(metricKeys.includes("maxRepsSet"), false);
});

test("equal best values keep the earliest original achievement", () => {
  const performances = getExerciseWorkoutMetrics({
    trackingType: "BODYWEIGHT_REPS",
    bodyweightLoadFactor: 1,
    userBodyweightKg: 80,
    ...VOLUME_CALCULATOR,
    occurrences: [
      occurrence({ sets: [{ ...EMPTY_SET, reps: 10 }] }),
      occurrence({
        workoutExerciseId: 2,
        workoutId: 2,
        startedAt: "2026-02-01T10:00:00.000Z",
        sets: [{ ...EMPTY_SET, reps: 10 }],
      }),
    ],
  });
  const metrics = getExerciseMetricDefinitions(
    "BODYWEIGHT_REPS",
    performances
  ).filter((metric) => metric.key === "maxRepsSet");
  const records = getExercisePersonalRecords(performances, metrics);
  const history = getExerciseRecordHistory(performances, metrics);

  assert.equal(records[0].workoutId, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].workoutId, 1);
});

test("separate workout timestamps on the same day are retained", () => {
  const performances = getExerciseWorkoutMetrics({
    trackingType: "DURATION",
    bodyweightLoadFactor: null,
    userBodyweightKg: null,
    ...VOLUME_CALCULATOR,
    occurrences: [
      occurrence({ sets: [{ ...EMPTY_SET, durationSeconds: 30 }] }),
      occurrence({
        workoutExerciseId: 2,
        workoutId: 2,
        startedAt: "2026-01-01T18:00:00.000Z",
        sets: [{ ...EMPTY_SET, durationSeconds: 45 }],
      }),
    ],
  });

  assert.equal(performances.length, 2);
  assert.notEqual(performances[0].startedAt, performances[1].startedAt);
});
