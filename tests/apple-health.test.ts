import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAppleHealthWorkoutPayload } from "@/lib/apple-health-workout";

test("Apple Health workout payload preserves canonical timestamps and actual completed distance", () => {
  const payload = getAppleHealthWorkoutPayload(42, {
    startedAt: "2026-08-14T18:00:00.000Z",
    completedAt: "2026-08-14T18:52:00.000Z",
    exercises: [
      { sets: [{ completed: true, distanceMeters: 5000 }, { completed: false, distanceMeters: 2000 }] },
    ],
  } as never);
  assert.equal(payload.workoutId, "42");
  assert.equal(payload.endedAtMs - payload.startedAtMs, 52 * 60 * 1000);
  assert.equal(payload.distanceMeters, 5000);
});

test("Apple Health bridge remains optional and native-only", async () => {
  const source = await readFile(new URL("../lib/native/apple-health.ts", import.meta.url), "utf8");
  assert.match(source, /isIOSApp\(\) && isNativePluginAvailable\("CalistheniHealth"\)/);
  assert.match(source, /weightKg: null/);
  assert.match(source, /HealthKit is optional/);
});

test("HealthKit plugin requests only workouts for writing and body mass for reading", async () => {
  const source = await readFile(new URL("../ios/App/App/CalistheniHealthPlugin.swift", import.meta.url), "utf8");
  assert.match(source, /requestAuthorization\(toShare: \[HKObjectType\.workoutType\(\)\], read: \[bodyMassType\]\)/);
  assert.match(source, /\.bodyMass/);
  assert.match(source, /HKMetadataKeyExternalUUID/);
  assert.match(source, /totalEnergyBurned: nil/);
  assert.doesNotMatch(source, /heartRate|stepCount|dietaryEnergyConsumed/);
});

test("HealthKit capability and privacy descriptions are configured on the app target", async () => {
  const [entitlements, info] = await Promise.all([
    readFile(new URL("../ios/App/App/App.entitlements", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8"),
  ]);
  assert.match(entitlements, /com\.apple\.developer\.healthkit/);
  assert.match(info, /NSHealthShareUsageDescription/);
  assert.match(info, /NSHealthUpdateUsageDescription/);
});

test("workout export happens only after Calistheni save and records success idempotently", async () => {
  const [builder, route] = await Promise.all([
    readFile(new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/user/workouts/[id]/apple-health-export/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(builder, /const workout = \(await response\.json\(\)\)/);
  assert.match(builder, /saveAppleHealthWorkout\([\s\S]*getAppleHealthWorkoutPayload/);
  assert.match(builder, /apple-health-export/);
  assert.match(route, /appleHealthExportedAt: null/);
  assert.match(route, /completedAt: \{ not: null \}/);
});
