import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getWorkoutExerciseSwipeDirection,
  getWorkoutExerciseSwipeOffset,
  shouldOpenWorkoutExerciseSwipe,
  WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH,
} from "@/lib/workout-exercise-swipe";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const builder = read("components/workouts/WorkoutBuilder.tsx");
const sortable = read("components/workouts/SortableExerciseList.tsx");
const swipeAction = read("components/workouts/WorkoutExerciseSwipeAction.tsx");
const superset = read("components/workouts/SupersetGroupCard.tsx");

test("swipe direction locks only after a clearly horizontal or vertical gesture", () => {
  assert.equal(getWorkoutExerciseSwipeDirection(30, 5), "horizontal");
  assert.equal(getWorkoutExerciseSwipeDirection(-30, 5), "horizontal");
  assert.equal(getWorkoutExerciseSwipeDirection(5, 30), "vertical");
  assert.equal(getWorkoutExerciseSwipeDirection(5, 2), null);
  assert.equal(getWorkoutExerciseSwipeDirection(12, 11), null);
});

test("swipe offset is clamped and a swipe never deletes by itself", () => {
  assert.equal(getWorkoutExerciseSwipeOffset(-200, false), -WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH);
  assert.equal(getWorkoutExerciseSwipeOffset(50, false), 0);
  assert.equal(shouldOpenWorkoutExerciseSwipe(-40, false), true);
  assert.equal(shouldOpenWorkoutExerciseSwipe(40, true), false);

  const finishGesture = swipeAction.slice(
    swipeAction.indexOf("function finishGesture"),
    swipeAction.indexOf("function cancelGesture")
  );
  assert.doesNotMatch(finishGesture, /onDelete/);
  assert.match(swipeAction, /aria-label=\{`Delete \$\{setLabel\}`\}/);
  assert.match(swipeAction, /onClick=\{onDelete\}/);
});

test("active exercise titles are the delayed drag activators without visible grip handles", () => {
  const activeList = builder.slice(
    builder.indexOf("selectedExercises.length === 0"),
    builder.indexOf('<aside className="hidden space-y-4 lg:block">')
  );

  assert.match(sortable, /TouchSensor[\s\S]*delay: 250, tolerance: 8/);
  assert.match(sortable, /export function SortableExerciseActivatorItem/);
  assert.match(activeList, /<SortableExerciseActivatorItem/);
  assert.match(activeList, /dragActivator\.attributes/);
  assert.match(activeList, /dragActivator\.listeners/);
  assert.match(activeList, /data-exercise-drag-activator/);
  assert.doesNotMatch(activeList, /GripVertical|dragHandle/);
});

test("header controls remain outside the drag activator with reserved right-side space", () => {
  const regularHeader = builder.slice(
    builder.indexOf("{(dragActivator) => ("),
    builder.indexOf('<AccordionContent className="space-y-2 px-0 pt-1 pb-3')
  );

  assert.match(regularHeader, /data-exercise-drag-activator[\s\S]*<\/div>[\s\S]*min-w-7 shrink-0 text-center/);
  assert.match(regularHeader, /size-10 min-w-10 flex-none justify-center/);
  assert.match(regularHeader, /DropdownMenuTrigger asChild/);
  assert.match(regularHeader, /aria-label=\{`Manage \$\{exercise\.name\}`\}/);
  assert.match(swipeAction, /button, input, textarea, select, a/);
});

test("set swipe delete is controlled, exclusive, cancelable, and preserves vertical scrolling", () => {
  assert.match(builder, /openSwipeSetId, setOpenSwipeSetId/);
  assert.match(builder, /setOpenSwipeSetId\(open \? set\.localId : null\)/);
  assert.match(builder, /onDragStart=\{\(\) => setOpenSwipeSetId\(null\)\}/);
  assert.match(swipeAction, /className=\{`relative z-10 touch-pan-y/);
  assert.match(
    swipeAction,
    /gestureOffset === null[\s\S]*transition-transform[\s\S]*transition-none/
  );
  assert.match(swipeAction, /direction === "vertical"/);
  assert.match(swipeAction, /document\.addEventListener\("pointerdown", closeFromOutsidePress, true\)/);
  assert.match(swipeAction, /gesture\.direction === null && gesture\.initiallyOpen/);
});

test("closed swipe rows do not paint or expose the destructive action", () => {
  assert.match(swipeAction, /const isDeleteRevealed = !disabled && offset < 0/);
  assert.match(
    swipeAction,
    /isDeleteRevealed \? "visible opacity-100" : "invisible opacity-0"/
  );
  assert.match(swipeAction, /aria-hidden=\{!isDeleteRevealed\}/);
  assert.match(swipeAction, /tabIndex=\{isDeleteRevealed \? 0 : -1\}/);
  assert.doesNotMatch(
    swipeAction,
    /absolute inset-y-0 right-0 flex items-stretch bg-destructive/
  );
  assert.match(swipeAction, /variant="destructive"/);
});

test("only individual set rows reveal delete and use the existing removeSet path", () => {
  const setTable = builder.slice(
    builder.indexOf("function renderExerciseSetTable"),
    builder.indexOf("function renderSupersetExerciseRow")
  );
  const exerciseRows = builder.slice(
    builder.indexOf("function renderSupersetExerciseRow"),
    builder.indexOf('<aside className="hidden space-y-4 lg:block">')
  );

  assert.match(setTable, /<WorkoutSetSwipeDeleteAction/);
  assert.match(setTable, /setLabel=\{`\$\{exercise\.name\} set \$\{setIndex \+ 1\}`\}/);
  assert.match(setTable, /onDelete=\{\(\) => removeSet\(selectedExercise\.localId, setIndex\)\}/);
  assert.match(setTable, /disabled=\{selectedExercise\.sets\.length <= 1\}/);
  assert.doesNotMatch(setTable, /Set \$\{setIndex \+ 1\} actions|Remove set/);
  assert.doesNotMatch(exerciseRows, /<WorkoutSetSwipeDeleteAction/);
  assert.match(exerciseRows, /setExercisePendingRemoval/);
  assert.match(exerciseRows, /data-exercise-drag-activator/);
});

test("superset rail stays reserved while superset sets share set-level swipe behavior", () => {
  assert.match(superset, /absolute inset-y-0 left-0 w-0\.5/);
  assert.match(superset, /px-0 py-2 pl-2/);
  assert.match(superset, /<div className="pl-2 md:border-t md:pl-0">/);

  const supersetRow = builder.slice(
    builder.indexOf("function renderSupersetExerciseRow"),
    builder.indexOf("function closeSupersetRoundForm")
  );
  assert.doesNotMatch(supersetRow, /WorkoutSetSwipeDeleteAction/);
  assert.match(supersetRow, /renderExerciseSetTable\(selectedExercise, exercise\)/);
  assert.match(superset, /Add sets to an exercise below, or use Add round for the full superset/);
  assert.doesNotMatch(builder, /Add a set here for this exercise only/);
});
