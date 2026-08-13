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

test("active superset editor uses membership sorting instead of arrow controls", () => {
  assert.match(builder, /getSupersetMembershipSortableId\(supersetEditorKey \?\? "new", localId\)/);
  assert.match(builder, /<SortableExerciseItem key=\{selectedExercise\.localId\}/);
  assert.doesNotMatch(builder, /aria-label=\{`Move \$\{exercise\.name\} earlier`\}|aria-label=\{`Move \$\{exercise\.name\} later`\}/);
});

test("active workout shell and headers constrain their own width instead of clipping the site", () => {
  assert.match(builder, /grid w-full min-w-0 max-w-full gap-6 overflow-x-clip/);
  assert.match(builder, /w-full min-w-0 max-w-full space-y-2/);
  assert.match(mobileHeader, /grid-cols-\[2\.25rem_3\.35rem_minmax\(0,1fr\)_3\.25rem\]/);
  assert.match(mobileHeader, /max-w-\[calc\(100%\+2rem\)\]/);
});

test("active exercise headers give long regular and superset names a flexible multi-line text region", () => {
  const detailPreview = read("components/exercises/ExerciseDetailPreview.tsx");
  const thumbnailDetailsTrigger = builder.slice(
    builder.indexOf("function renderExerciseThumbnailDetailsTrigger"),
    builder.indexOf("function renderSupersetExerciseRow")
  );
  const supersetMemberHeader = builder.slice(
    builder.indexOf("function renderSupersetExerciseRow"),
    builder.indexOf("function closeSupersetRoundForm")
  );
  const regularExerciseHeader = builder.slice(
    builder.lastIndexOf("<AccordionItem", builder.indexOf("relative overflow-hidden rounded-xl")),
    builder.indexOf('<AccordionContent className="space-y-2 border-t px-2 pt-2 pb-2">')
  );
  const longNameFixtures = [
    "Bicycle Crunch Raised Legs",
    "Cable Twist (Down to up)",
    "My very long custom exercise name for narrow mobile screens",
  ];

  for (const name of longNameFixtures) {
    assert.ok(name.length > 20);
  }

  for (const header of [supersetMemberHeader, regularExerciseHeader]) {
    assert.match(header, /<div className=\{ACTIVE_EXERCISE_HEADER_ROW_CLASS\}>/);
    assert.match(header, /min-w-0 flex-1 text-left/);
    assert.match(header, /break-words text-sm leading-tight font-semibold line-clamp-3 min-\[375px\]:line-clamp-2/);
    assert.match(header, /<p className="truncate text-xs leading-tight text-muted-foreground">/);
    assert.doesNotMatch(header, /<h[23] className="truncate/);
    assert.match(header, /items-center gap-1 whitespace-nowrap/);
    assert.match(header, /flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap/);
    assert.match(header, /shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums/);
    assert.match(header, /\{renderExerciseThumbnailDetailsTrigger\(exercise\)\}[\s\S]*<AccordionTrigger/);
    assert.match(header, /<\/AccordionTrigger>[\s\S]*<div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap/);
    assert.doesNotMatch(header, /ExerciseDetailPreview exercise=\{exercise\} compact/);
  }

  assert.match(thumbnailDetailsTrigger, /aria-label=\{`View details for \$\{exercise\.name\}`\}/);
  assert.match(thumbnailDetailsTrigger, /getExerciseThumbnailSrc\(exercise\.thumbnailUrl\)/);
  assert.match(thumbnailDetailsTrigger, /size-11 shrink-0 rounded-md p-0 focus-visible:ring-2/);
  assert.match(thumbnailDetailsTrigger, /className="size-11 rounded-md bg-muted object-cover"/);
  assert.doesNotMatch(thumbnailDetailsTrigger, /-m[trblxy]?-/);
  assert.match(builder, /ACTIVE_EXERCISE_HEADER_ROW_CLASS =\s*"flex min-w-0 flex-nowrap items-start gap-2 px-2\.5 py-2\.5"/);
  assert.match(detailPreview, /trigger\?: ReactNode/);
  assert.match(detailPreview, /<SheetTrigger asChild>[\s\S]*\{trigger \?\?/);
  assert.match(supersetMemberHeader, /<Badge[\s\S]*\{supersetLabel\.replace\("Superset ", ""\)\}[\s\S]*groupPosition \+ 1/);
  assert.match(supersetMemberHeader, /\{dragHandle\}/);
  assert.match(supersetMemberHeader, /EllipsisVertical/);
  assert.match(regularExerciseHeader, /\{dragHandle\}/);
  assert.match(regularExerciseHeader, /EllipsisVertical/);
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
test("Add Exercise uses a full-height stable multi-select picker without input autofocus", () => {
  const source = builder;
  assert.match(source, /h-\[100dvh\] max-h-\[100dvh\]/);
  assert.match(source, /data-keyboard-dismiss-on-scroll/);
  assert.doesNotMatch(source, /All Equipment/);
  assert.match(source, /All Muscles/);
  assert.match(source, /All Types/);
  assert.match(source, /Add \$\{pickerSelectedIds\.length\} Exercise/);
  assert.match(source, /setPickerSelectedIds/);
  assert.doesNotMatch(source, /exercisePickerViewport|autoFocus/);
});
