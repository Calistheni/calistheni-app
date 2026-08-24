import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const builder = read("components/workouts/WorkoutBuilder.tsx");
const superset = read("components/workouts/SupersetGroupCard.tsx");
const mobileHeader = read("components/workouts/MobileActiveWorkoutHeader.tsx");
const activeWorkoutPage = read("app/workouts/new/page.tsx");

test("superset sections and sortable exercise wrappers can shrink within a narrow viewport", () => {
  assert.match(superset, /block w-full min-w-0 max-w-full/);
  assert.match(superset, /w-full min-w-0 max-w-full border-b border-border\/70 bg-transparent/);
  assert.match(superset, /md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card/);
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

test("active workout uses compact mobile gutters without losing its desktop constraint", () => {
  assert.match(activeWorkoutPage, /max-w-7xl bg-background px-2 pb-0 pt-0 sm:p-6 lg:p-8/);
  assert.doesNotMatch(activeWorkoutPage, /bg-background px-4/);
  assert.match(builder, /grid w-full min-w-0 max-w-full gap-6 overflow-x-clip/);
  assert.match(builder, /w-full min-w-0 max-w-full space-y-0 md:space-y-2/);
  assert.match(mobileHeader, /grid-cols-\[2\.5rem_2\.5rem_minmax\(0,1fr\)_3\.75rem\]/);
  assert.match(mobileHeader, /-mx-2[\s\S]*max-w-\[calc\(100%\+1rem\)\][\s\S]*sm:-mx-6/);
});

test("mobile header is an integrated full-width workout surface", () => {
  assert.match(mobileHeader, /shrink-0 border-b bg-card\/95 backdrop-blur/);
  assert.doesNotMatch(mobileHeader, /overflow-hidden rounded-xl border bg-card/);
  assert.doesNotMatch(mobileHeader, /shadow-sm/);
  assert.match(mobileHeader, /gap-1 px-2 pt-\[calc\(env\(safe-area-inset-top\)\+0\.25rem\)\] pb-1/);
  assert.match(mobileHeader, /grid grid-cols-3 border-t border-border\/60 text-center/);
  assert.doesNotMatch(mobileHeader, /divide-x|bg-muted\/30/);
});

test("mobile exercises are continuous divider-separated sections with desktop cards retained", () => {
  assert.match(builder, /pb-\[calc\(env\(safe-area-inset-bottom\)\+0\.75rem\)\]/);
  assert.match(builder, /className="relative w-full max-w-full border-b border-border\/70 bg-transparent pb-1/);
  assert.match(builder, /md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:pb-0 md:shadow-sm md:last:border-b/);
  assert.doesNotMatch(builder, /className="relative w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm/);
  assert.match(builder, /className="w-full min-w-0 max-w-full space-y-0 md:space-y-2"/);
  assert.doesNotMatch(activeWorkoutPage, /safe-area-inset-bottom/);
});

test("mobile exercise content uses the route inset without nested card padding", () => {
  assert.match(activeWorkoutPage, /bg-background px-2 pb-0 pt-0/);
  assert.match(builder, /<section className="min-w-0 space-y-1 md:space-y-4">/);
  assert.match(builder, /<div className="flex justify-end py-0\.5 md:py-0">/);
  assert.match(builder, /ACTIVE_EXERCISE_HEADER_ROW_CLASS =\s*"flex min-w-0 flex-nowrap items-start gap-2 px-0 py-2 md:px-2\.5"/);
  assert.match(builder, /AccordionContent className="space-y-2 px-0 pt-1 pb-3 md:border-t md:px-2/);
  assert.match(builder, /group border-y px-0 py-1[\s\S]*md:rounded-md md:border md:p-1/);
  assert.match(superset, /space-y-2 px-0 py-2 pl-2[\s\S]*md:px-3 md:py-3 md:pl-4/);
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
    builder.lastIndexOf("<AccordionItem", builder.indexOf("relative w-full max-w-full border-b border-border/70 bg-transparent pb-1")),
    builder.indexOf('<AccordionContent className="space-y-2 px-0 pt-1 pb-3')
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
    assert.match(header, /min-w-0 flex-1[^\"]*text-left/);
    assert.match(header, /break-words text-sm leading-tight font-semibold text-primary line-clamp-3 min-\[375px\]:line-clamp-2/);
    assert.match(header, /<p className="truncate text-xs leading-tight text-muted-foreground">/);
    assert.doesNotMatch(header, /<h[23] className="truncate/);
    assert.match(header, /data-exercise-drag-activator/);
    assert.match(header, /flex shrink-0 flex-nowrap items-center gap-0\.5 whitespace-nowrap/);
    assert.match(header, /min-w-7 shrink-0 text-center text-xs font-semibold tabular-nums/);
    assert.match(header, /\{renderExerciseThumbnailDetailsTrigger\(exercise\)\}[\s\S]*<AccordionTrigger/);
    assert.match(header, /size-10 min-w-10 flex-none justify-center/);
    assert.match(header, /<\/AccordionTrigger>[\s\S]*<DropdownMenu>/);
    assert.doesNotMatch(header, /\{dragHandle\}/);
    assert.doesNotMatch(header, /ExerciseDetailPreview exercise=\{exercise\} compact/);
  }

  assert.match(thumbnailDetailsTrigger, /aria-label=\{`View details for \$\{exercise\.name\}`\}/);
  assert.match(thumbnailDetailsTrigger, /getExerciseThumbnailSrc\(exercise\.thumbnailUrl\)/);
  assert.match(thumbnailDetailsTrigger, /size-11 shrink-0 rounded-md p-0 focus-visible:ring-2/);
  assert.match(thumbnailDetailsTrigger, /className="size-11 rounded-md bg-muted object-cover"/);
  assert.doesNotMatch(thumbnailDetailsTrigger, /-m[trblxy]?-/);
  assert.match(builder, /ACTIVE_EXERCISE_HEADER_ROW_CLASS =\s*"flex min-w-0 flex-nowrap items-start gap-2 px-0 py-2 md:px-2\.5"/);
  assert.match(detailPreview, /trigger\?: ReactNode/);
  assert.match(detailPreview, /<SheetTrigger asChild>[\s\S]*\{trigger \?\?/);
  assert.match(supersetMemberHeader, /<Badge[\s\S]*\{supersetLabel\.replace\("Superset ", ""\)\}[\s\S]*groupPosition \+ 1/);
  assert.match(supersetMemberHeader, /SortableExerciseActivator/);
  assert.match(supersetMemberHeader, /EllipsisVertical/);
  assert.match(regularExerciseHeader, /dragActivator\.listeners/);
  assert.match(regularExerciseHeader, /EllipsisVertical/);
});

test("active-workout number inputs use the compact shared table-value size", () => {
  assert.match(builder, /h-8 min-w-0 rounded-md bg-background\/80 px-1 text-center text-base font-semibold tabular-nums md:text-sm/);
  assert.match(read("components/workouts/SupersetRoundForm.tsx"), /className="text-base"/);
});

test("responsive table headers abbreviate without losing their matching grid column", () => {
  const table = builder.slice(
    builder.indexOf("function renderExerciseSetTable"),
    builder.indexOf("function renderSupersetExerciseRow")
  );
  assert.match(table, /<span className="lg:hidden">Prev<\/span>/);
  assert.match(table, /<span className="hidden lg:inline">Previous<\/span>/);
  assert.match(table, /<span className="lg:hidden">Done<\/span>/);
  assert.match(table, /<span className="hidden lg:inline">Completed<\/span>/);
  assert.match(table, /WORKOUT_TABLE_HEADER_CELL_CLASS/);
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
