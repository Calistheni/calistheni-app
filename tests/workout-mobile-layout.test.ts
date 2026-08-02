import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const builder = read("components/workouts/WorkoutBuilder.tsx");
const superset = read("components/workouts/SupersetGroupCard.tsx");
const mobileHeader = read("components/workouts/MobileActiveWorkoutHeader.tsx");

test("superset cards and sortable exercise wrappers can shrink within a narrow viewport", () => {
  assert.match(superset, /block w-full min-w-0 max-w-full/);
  assert.match(superset, /w-full min-w-0 max-w-full overflow-hidden/);
  assert.match(superset, /line-clamp-2 max-w-full break-words/);
  assert.match(superset, /aria-label=\{`\$\{label\}, \$\{exerciseNames\.length\} exercises`\}/);
  assert.match(read("components/workouts/SortableExerciseList.tsx"), /w-full min-w-0 max-w-full/);
});

test("workout group cards use unique render-entry identities instead of a reused superset key", () => {
  assert.match(builder, /getSupersetRenderEntries\(supersets, selectedExercises\)\.map\(\(entry\) =>/);
  assert.match(builder, /<SupersetGroupCard[\s\S]*key=\{entry\.key\}/);
  assert.doesNotMatch(builder, /<SupersetGroupCard[\s\S]*key=\{superset\.key\}/);
});

test("active workout shell and headers constrain their own width instead of clipping the site", () => {
  assert.match(builder, /grid w-full min-w-0 max-w-full gap-6 overflow-x-clip/);
  assert.match(builder, /w-full min-w-0 max-w-full space-y-2/);
  assert.match(mobileHeader, /grid-cols-\[2\.25rem_3\.35rem_minmax\(0,1fr\)_3\.25rem\]/);
  assert.match(mobileHeader, /max-w-\[calc\(100%\+2rem\)\]/);
});

test("active-workout number inputs retain a 16px mobile font size to avoid Safari focus zoom", () => {
  assert.match(builder, /h-9 min-w-0 text-base/);
  assert.match(read("components/workouts/SupersetRoundForm.tsx"), /className="text-base"/);
});

test("set rows use shrinkable grids rather than fixed horizontal field widths", () => {
  assert.match(builder, /grid-cols-\[1\.25rem_minmax\(0,1fr\)_auto_auto/);
  assert.match(builder, /grid min-w-0 gap-1/);
  assert.doesNotMatch(builder, /overflow-x-auto|overflow-x-scroll/);
});

test("toasts use viewport-safe dimensions and cannot widen the workout page", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /\[data-sonner-toaster\]/);
  assert.match(styles, /--width: min\(22\.25rem, calc\(100vw - 2rem\)\)/);
  assert.match(styles, /\[data-sonner-toast\][\s\S]*max-width: calc\(100vw - 2rem\)/);
});
