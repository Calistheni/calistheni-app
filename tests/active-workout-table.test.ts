import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const picker = fs.readFileSync(
  path.join(root, "components/workouts/WorkoutBuilder.tsx"),
  "utf8"
);
const referencesRoute = fs.readFileSync(
  path.join(root, "app/api/user/workout-performance-references/route.ts"),
  "utf8"
);

test("active workout uses one adaptive CSS-grid table for its headers and rows", () => {
  assert.match(picker, /function getSetMetricColumns/);
  assert.match(picker, /function getSetTableGridClass/);
  assert.match(picker, /SET|Set<\/span><span>Previous/);
  assert.match(picker, /renderExerciseSetTable\(selectedExercise, exercise\)/);
  assert.match(picker, /BODYWEIGHT_REPS/);
  assert.match(picker, /WEIGHTED_BODYWEIGHT/);
  assert.match(picker, /DISTANCE_DURATION/);
});

test("set tables expose previous performance, PR, RPE, and completion without changing existing controls", () => {
  assert.match(picker, /formatPreviousSetPerformance/);
  assert.match(picker, /getActiveSetPersonalRecordDisplay/);
  assert.match(picker, /New personal record/);
  assert.match(picker, /Set RPE for set/);
  assert.match(picker, /Mark set .* complete/);
  assert.match(picker, /Add set/);
});

test("the visible table keeps history out of current inputs and removes the delete column", () => {
  const table = picker.slice(
    picker.indexOf("function renderExerciseSetTable"),
    picker.indexOf("function renderSupersetExerciseRow")
  );
  assert.match(table, /placeholder=""/);
  assert.doesNotMatch(table, /placeholder=\{getSetPlaceholder/);
  assert.match(table, /formatPreviousSetPerformance/);
  assert.match(table, /set\.rpe \?\? "RPE"/);
  assert.match(table, /WorkoutSetSwipeDeleteAction/);
  assert.match(table, /onDelete=\{\(\) => removeSet\(selectedExercise\.localId, setIndex\)\}/);
  assert.doesNotMatch(table, /Remove set|Set \$\{setIndex \+ 1\} actions/);
});

test("previous performance is position-specific instead of repeating a fallback best", () => {
  const tableHelpers = picker.slice(
    picker.indexOf("function formatPreviousSetPerformance"),
    picker.indexOf("function formatVolumeKg")
  );
  assert.match(tableHelpers, /const set = previous\.sets\[setIndex\]/);
  assert.doesNotMatch(tableHelpers, /fallbackBest/);
});

test("set tables use full-width fractional tracking-type grids rather than an intrinsic fixed width", () => {
  const gridConfig = picker.slice(
    picker.indexOf("const SET_TABLE_GRID_BY_TRACKING_TYPE"),
    picker.indexOf("// Kept for the compact superset")
  );
  assert.match(gridConfig, /BODYWEIGHT_REPS/);
  assert.match(gridConfig, /WEIGHTED_BODYWEIGHT/);
  assert.match(gridConfig, /DURATION/);
  assert.match(gridConfig, /DISTANCE_DURATION/);
  assert.match(gridConfig, /minmax\(4rem,1\.55fr\)/);
  assert.match(gridConfig, /minmax\(7rem,1\.65fr\)/);
  const table = picker.slice(
    picker.indexOf("function renderExerciseSetTable"),
    picker.indexOf("function renderSupersetExerciseRow")
  );
  assert.match(table, /grid w-full min-w-0/);
  assert.match(table, /w-full max-w-28 justify-self-center/);
});

test("headers and set cells share one tracking grid and centered cell primitives", () => {
  const table = picker.slice(
    picker.indexOf("function renderExerciseSetTable"),
    picker.indexOf("function renderSupersetExerciseRow")
  );
  const sharedGrid = "getSetTableGridClass(exercise.trackingType, rpeTrackingEnabled)";
  assert.equal(table.split(sharedGrid).length - 1, 2);
  assert.match(table, /WORKOUT_TABLE_HEADER_CELL_CLASS/);
  assert.match(table, /WORKOUT_TABLE_CELL_CLASS/);
  assert.match(table, /<span className="lg:hidden">Prev<\/span>/);
  assert.match(table, /<span className="lg:hidden">Done<\/span>/);
});

test("previous-performance data includes completed-set RPE alongside the existing metrics", () => {
  assert.match(referencesRoute, /floors: true, rpe: true/);
  assert.match(referencesRoute, /\{ rpe: set\.rpe \}/);
  assert.match(referencesRoute, /buildExercisePersonalRecordContext/);
});

test("previous and PR primary values use the shared table-value typography", () => {
  const table = picker.slice(
    picker.indexOf("function renderExerciseSetTable"),
    picker.indexOf("function renderSupersetExerciseRow")
  );
  assert.match(table, /getPreviousSetPerformance/);
  assert.match(table, /WORKOUT_TABLE_VALUE_CLASS/);
  assert.match(table, /text-xs text-muted-foreground/);
  assert.match(table, /NEW PR/);
  assert.match(table, /text-primary/);
});

test("weighted previous and PR displays share the complete weight-by-reps formatter", () => {
  const helpers = picker.slice(
    picker.indexOf("function getPreviousSetPerformance"),
    picker.indexOf("function formatVolumeKg")
  );
  const table = picker.slice(
    picker.indexOf("function renderExerciseSetTable"),
    picker.indexOf("function renderSupersetExerciseRow")
  );
  assert.match(helpers, /formatWeightedPerformance/);
  assert.doesNotMatch(helpers, /\+.*kg/);
  assert.match(table, /pr\.newValue/);
  assert.match(table, /NEW PR/);
  assert.match(table, /previousWeight: previous\.weight/);
});

test("history context is batch-preloaded and cached before multi-select cards are inserted", () => {
  assert.match(picker, /loadedPerformanceReferenceIdsRef/);
  assert.match(picker, /\[\.\.\.new Set\(ids\)\]/);
  assert.match(picker, /await preloadPerformanceReferences\(pickerSelectedIds\)/);
  assert.match(picker, /Preparing…/);
  assert.match(picker, /Loading personal record/);
});
