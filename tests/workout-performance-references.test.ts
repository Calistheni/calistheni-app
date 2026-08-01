import assert from "node:assert/strict";
import test from "node:test";
import {
  getPerformanceReference,
  getPerformanceReferenceDescription,
} from "../lib/workout-performance-references.ts";

const reference = {
  personalBest: { reps: 17, weight: 40, durationSeconds: 80, distanceMeters: 5000 },
  previousWorkout: { sets: [{ reps: 6, weight: 32.5, durationSeconds: 45, distanceMeters: 3200 }], fallbackBest: {} },
};

test("uses compact PR and PREV placeholders without repeating field metrics", () => {
  assert.equal(getPerformanceReference(reference, "reps", 0, "Reps"), "PR 17 · PREV 6");
  assert.equal(getPerformanceReference(reference, "weight", 0, "Weight"), "PR 40 · PREV 32.5");
  assert.equal(getPerformanceReference(reference, "durationSeconds", 0, "Duration"), "PR 1:20 · PREV 0:45");
  assert.equal(getPerformanceReference(reference, "distanceMeters", 0, "Distance"), "PR 5 km · PREV 3.2 km");
  assert.equal(getPerformanceReference({ personalBest: { reps: 17 }, previousWorkout: null }, "reps", 0, "Reps"), "PR 17");
  assert.equal(getPerformanceReference({ personalBest: {}, previousWorkout: { sets: [{ reps: 6 }], fallbackBest: {} } }, "reps", 0, "Reps"), "PREV 6");
});

test("keeps full units in screen-reader descriptions", () => {
  assert.equal(
    getPerformanceReferenceDescription(reference, "reps", 0),
    "All-time personal record: 17 repetitions. Previous workout: 6 repetitions."
  );
});
