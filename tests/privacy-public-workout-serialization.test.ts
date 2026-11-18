import assert from "node:assert/strict";
import test from "node:test";
import { mapWorkoutSummary } from "@/lib/workout-summary";

test("workout summary exposes only intended public profile fields and derived statistics", () => {
  const summary = mapWorkoutSummary({
    id: 42,
    title: "Public workout",
    startedAt: new Date("2026-11-19T10:00:00.000Z"),
    completedAt: new Date("2026-11-19T11:00:00.000Z"),
    updatedAt: new Date("2026-11-19T11:00:00.000Z"),
    visibility: "PUBLIC",
    user: {
      id: "user-public-id",
      name: "Public name",
      image: "https://images.example/avatar.jpg",
      bodyweightKg: 72.5,
      email: "private@example.com",
      bodyMeasurements: { waistCm: 80 },
      subscription: { stripeCustomerId: "private-billing-id" },
    } as never,
    exercises: [
      {
        exercise: {
          trackingType: "WEIGHTED_BODYWEIGHT",
          bodyweightLoadFactor: 1,
        },
        sets: [{ reps: 8, weight: 10, completed: true }],
      },
    ],
  });

  assert.deepEqual(summary.user, {
    id: "user-public-id",
    name: "Public name",
    image: "https://images.example/avatar.jpg",
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("private@example.com"), false);
  assert.equal(serialized.includes("72.5"), false);
  assert.equal(serialized.includes("waistCm"), false);
  assert.equal(serialized.includes("private-billing-id"), false);
  assert.equal(summary.totalVolume, 660);
});
