import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { workoutMutationSchema } from "@/lib/validation/workouts";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every product volume path uses the canonical workout-volume module", async () => {
  const [
    builder,
    workouts,
    records,
    recordMetrics,
    weeklyReports,
    adminInsights,
  ] = await Promise.all([
    read("components/workouts/WorkoutBuilder.tsx"),
    read("lib/workouts.ts"),
    read("lib/personal-records.ts"),
    read("lib/exercise-record-metrics.ts"),
    read("lib/weekly-progress-reports.ts"),
    read("lib/admin-user-insights.ts"),
  ]);

  assert.match(builder, /calculateWorkoutVolumeKg/);
  assert.match(builder, /weightKg: set\.weight/);
  assert.match(builder, /userBodyweightKg: currentUserBodyweightKg/);
  assert.match(workouts, /calculateWorkoutVolumeKg/);
  assert.match(records, /calculateSetVolumeKg/);
  assert.match(recordMetrics, /calculateSetVolume/);
  assert.match(weeklyReports, /calculateWorkoutVolumeKg/);
  assert.match(adminInsights, /calculateWorkoutVolumeKg/);
  assert.doesNotMatch(
    adminInsights,
    /\(set\.reps \?\? 0\) \* \(set\.weight \?\? 0\)/
  );
});

test("active workout keeps added weight separate while total volume uses bodyweight", async () => {
  const builder = await read("components/workouts/WorkoutBuilder.tsx");

  assert.match(builder, /weightKg: set\.weight/);
  assert.match(builder, /trackingType === "WEIGHTED_BODYWEIGHT"/);
  assert.match(builder, /`Set \$\{setIndex \+ 1\} added weight`/);
  assert.match(builder, /formatVolumeKg\(liveVolumeKg\)/);
});

test("the current tracking model rejects negative assistance loads", () => {
  const parsed = workoutMutationSchema.safeParse({
    title: "Assistance validation",
    notes: null,
    startedAt: null,
    completedAt: null,
    visibility: "PRIVATE",
    supersets: [],
    exercises: [
      {
        localId: "exercise-1",
        exerciseId: "pull-up-weighted",
        notes: null,
        restSeconds: null,
        supersetKey: null,
        supersetPosition: null,
        sets: [
          {
            reps: 10,
            weight: -20,
            durationSeconds: null,
            distanceMeters: null,
            steps: null,
            floors: null,
            rpe: null,
            notes: null,
            completed: true,
            supersetRoundIndex: null,
            supersetRoundId: null,
          },
        ],
      },
    ],
  });

  assert.equal(parsed.success, false);
});

test("workout volume remains derived instead of denormalized on Workout", async () => {
  const schema = await read("prisma/schema.prisma");
  const workoutModel = schema.match(/model Workout \{([\s\S]*?)\n\}/)?.[1];

  assert.ok(workoutModel);
  assert.doesNotMatch(workoutModel, /totalVolume|volumeKg/);
});
