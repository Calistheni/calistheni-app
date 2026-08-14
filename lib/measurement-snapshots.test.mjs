import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAnthropometrySummary,
  FREE_MEASUREMENT_HISTORY_LIMIT,
  getMeasurementCapabilities,
} from "./anthropometry.ts";
import {
  mergeMeasurementSnapshot,
  measurementSchema,
  validateStoredMeasurementCapabilities,
} from "./progress.ts";
import {
  resolveLatestMeasurementState,
  resolveMeasurementHistory,
} from "./latest-body-measurements.ts";

const completeSnapshot = {
  heightCm: 188,
  bodyweightKg: 90,
  waistCm: 88,
  neckCm: 40,
  shouldersCm: 127,
  chestCm: 105,
  hipsCm: 104,
  bicepsCm: 40,
  forearmCm: 30,
  thighCm: 58,
  calfCm: 40,
};

test("a partial waist update creates a complete merged measurement snapshot", () => {
  const merged = mergeMeasurementSnapshot(completeSnapshot, { waistCm: 86 });
  assert.equal(merged.waistCm, 86);
  for (const [field, value] of Object.entries(completeSnapshot)) {
    if (field !== "waistCm") assert.equal(merged[field], value);
  }
  assert.equal(
    completeSnapshot.waistCm,
    88,
    "the historical snapshot is not mutated"
  );
});

test("entitlement validation blocks restricted changes without erasing existing Pro values", () => {
  assert.equal(FREE_MEASUREMENT_HISTORY_LIMIT, 10);
  assert.equal(getMeasurementCapabilities(false).historyLimit, 10);
  assert.equal(
    validateStoredMeasurementCapabilities({ shouldersCm: 127 }, false).success,
    false
  );
  const afterFreeFieldUpdate = mergeMeasurementSnapshot(completeSnapshot, {
    waistCm: 86,
  });
  assert.equal(afterFreeFieldUpdate.shouldersCm, 127);
  assert.equal(afterFreeFieldUpdate.thighCm, 58);
});

test("omitted fields remain present across sequential partial updates", () => {
  const afterWeight = mergeMeasurementSnapshot(completeSnapshot, {
    bodyweightKg: 88,
  });
  const afterWaist = mergeMeasurementSnapshot(afterWeight, { waistCm: 85 });
  assert.equal(afterWeight.waistCm, 88);
  assert.equal(afterWeight.neckCm, 40);
  assert.equal(afterWeight.hipsCm, 104);
  assert.equal(afterWaist.bodyweightKg, 88);
  assert.equal(afterWaist.waistCm, 85);
  assert.equal(afterWaist.thighCm, 58);
});

test("an explicit clear removes only the selected field while empty submissions preserve values", () => {
  const unchanged = mergeMeasurementSnapshot(completeSnapshot, {});
  assert.deepEqual(unchanged, completeSnapshot);
  const cleared = mergeMeasurementSnapshot(completeSnapshot, {}, ["hipsCm"]);
  assert.equal(cleared.hipsCm, null);
  assert.equal(cleared.waistCm, 88);
  assert.equal(cleared.chestCm, 105);
});

test("derived calculations receive the complete merged latest snapshot", () => {
  const merged = mergeMeasurementSnapshot(completeSnapshot, { waistCm: 86 });
  const summary = calculateAnthropometrySummary({
    bodyweightKg: Number(merged.bodyweightKg),
    heightCm: Number(merged.heightCm),
    manualBodyFatPercent: 20,
    waistAtNavelCm: Number(merged.waistCm),
    hipsCm: Number(merged.hipsCm),
  });
  assert.equal(summary.leanBodyMassKg, 72);
  assert.equal(summary.waistToHipRatio, 86 / 104);
  assert.equal(summary.waistToHeightRatio, 86 / 188);
});

test("latest measurement state combines the newest valid value for every kind", () => {
  const current = resolveLatestMeasurementState([
    { measuredAt: "2026-08-14T16:30:00.000Z", bodyweightKg: 90 },
    {
      measuredAt: "2026-07-10T09:00:00.000Z",
      heightCm: 188,
      neckCm: 40,
      waistCm: 88,
      chestCm: 105,
    },
  ]);
  assert.equal(current.bodyweightKg, 90);
  assert.equal(current.heightCm, 188);
  assert.equal(current.neckCm, 40);
  assert.equal(current.waistCm, 88);
  assert.equal(current.chestCm, 105);
});

test("legacy left/right values resolve to one canonical value without exposing sides", () => {
  const current = resolveLatestMeasurementState([
    {
      measuredAt: "2026-07-10T09:00:00.000Z",
      rightUpperArmCm: 37,
      rightForearmCm: 29,
      rightThighCm: 57,
      rightCalfCm: 39,
    },
  ]);
  assert.equal(current.bicepsCm, 37);
  assert.equal(current.forearmCm, 29);
  assert.equal(current.thighCm, 57);
  assert.equal(current.calfCm, 39);
});

test("a weight-only check-in retains the full snapshot and marks only weight changed", () => {
  const history = resolveMeasurementHistory([
    {
      measuredAt: "2026-07-14T08:00:00.000Z",
      bodyweightKg: 90,
      heightCm: 188,
      neckCm: 40,
      shouldersCm: 127,
      chestCm: 105,
      waistCm: 88,
      hipsCm: 104,
      bicepsCm: 40,
      forearmCm: 30,
      wristCm: 17,
      thighCm: 58,
      calfCm: 40,
      ankleCm: 23,
    },
    {
      measuredAt: "2026-08-14T08:00:00.000Z",
      bodyweightKg: 95,
      heightCm: 188,
      neckCm: 40,
      shouldersCm: 127,
      chestCm: 105,
      waistCm: 88,
      hipsCm: 104,
      bicepsCm: 40,
      forearmCm: 30,
      wristCm: 17,
      thighCm: 58,
      calfCm: 40,
      ankleCm: 23,
    },
  ]);
  assert.deepEqual(history[1].changedFields, ["bodyweightKg"]);
  assert.equal(history[1].snapshot.heightCm, 188);
  assert.equal(history[1].snapshot.waistCm, 88);
  assert.equal(history[1].snapshot.bodyweightKg, 95);
});

test("a first check-in has only the supplied values and marks them as newly added", () => {
  const first = resolveMeasurementHistory([
    {
      measuredAt: "2026-08-14T08:00:00.000Z",
      bodyweightKg: 90,
      heightCm: 188,
      neckCm: 40,
      waistCm: 88,
    },
  ])[0];
  assert.deepEqual(first.changedFields, [
    "bodyweightKg",
    "heightCm",
    "neckCm",
    "waistCm",
  ]);
  assert.equal(first.snapshot.hipsCm, undefined);
  assert.equal(first.snapshot.bodyweightKg, 90);
});

test("an omitted, empty, or whitespace check-in note is optional and normalizes to absence", () => {
  const base = {
    measuredAt: new Date("2026-08-14T08:00:00.000Z"),
    bodyweightKg: 90,
  };
  for (const payload of [
    base,
    { ...base, note: null },
    { ...base, note: "" },
    { ...base, note: "   " },
  ]) {
    const result = measurementSchema.safeParse(payload);
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.note == null, true);
  }
  const saved = measurementSchema.safeParse({
    ...base,
    note: " Feeling good ",
  });
  assert.equal(saved.success, true);
  if (saved.success) assert.equal(saved.data.note, "Feeling good");
});

test("a note cannot make an invalid body measurement valid", () => {
  const result = measurementSchema.safeParse({
    measuredAt: new Date("2026-08-14T08:00:00.000Z"),
    bodyweightKg: 1,
    note: "Feeling good",
  });
  assert.equal(result.success, false);
  if (!result.success)
    assert.ok(
      result.error.issues.some((issue) => issue.path[0] === "bodyweightKg")
    );
});

test("equivalent numeric values do not create a changed measurement", () => {
  const previous = { bodyweightKg: 90, waistCm: 88 };
  const next = { bodyweightKg: 90.0, waistCm: 88 };
  const history = resolveMeasurementHistory([
    { measuredAt: "2026-07-14T08:00:00.000Z", ...previous },
    { measuredAt: "2026-08-14T08:00:00.000Z", ...next },
  ]);
  assert.deepEqual(history[1].changedFields, []);
});

test("the tracker pre-fills and submits only changed values with an explicit clear mechanism", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../components/profile/MeasurementTracker.tsx", import.meta.url),
      "utf8"
    )
  );
  assert.match(source, /for \(const \[field\] of STORAGE_FIELDS\)/);
  assert.match(source, /Math\.abs\(parsed - previous\) <= 1e-9/);
  assert.match(source, /clearFields/);
  assert.match(source, /resolveLatestMeasurementState\(entries\)/);
  assert.match(source, /pb-\[calc\(env\(safe-area-inset-bottom\)\+1rem\)\]/);
  assert.match(source, /type="submit"/);
  assert.match(source, /w-full sm:w-auto/);
  assert.match(source, /overflow-hidden/);
  assert.match(source, /rounded-none border-t bg-popover/);
  assert.doesNotMatch(source, /leftUpperArmRelaxedCm|rightUpperArmRelaxedCm/);
});

test("dialogs layer above the mobile navigation", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8")
  );
  assert.match(source, /z-\[70\]/);
});

test("the body chart is a thin adapter over the shared PR progress chart", async () => {
  const fs = await import("node:fs/promises");
  const [bodyChart, exerciseChart, sharedChart] = await Promise.all(
    [
      "../components/profile/BodyMeasurementProgressChart.tsx",
      "../components/exercises/ExerciseProgressChart.tsx",
      "../components/charts/ProgressChart.tsx",
    ].map((file) => fs.readFile(new URL(file, import.meta.url), "utf8"))
  );
  assert.match(bodyChart, /from "@\/components\/charts\/ProgressChart"/);
  assert.match(bodyChart, /changedFields\.includes\(field\)/);
  assert.doesNotMatch(
    bodyChart,
    /LineChart|ChartContainer|ChartTooltipContent/
  );
  assert.match(exerciseChart, /from "@\/components\/charts\/ProgressChart"/);
  assert.match(sharedChart, /ChartContainer/);
  assert.match(sharedChart, /LineChart/);
  assert.match(sharedChart, /LockKeyhole/);
});
