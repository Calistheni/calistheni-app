import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("superset round form reserves a dedicated mobile-safe scrolling body", async () => {
  const [form, builder] = await Promise.all([
    readFile(new URL("components/workouts/SupersetRoundForm.tsx", root), "utf8"),
    readFile(new URL("components/workouts/WorkoutBuilder.tsx", root), "utf8"),
  ]);

  assert.match(form, /data-slot="superset-round-scroll-area"/);
  assert.match(form, /data-active-workout-scroll-owner/);
  assert.match(form, /min-h-0 flex-1.*overflow-y-auto/s);
  assert.match(form, /z-10 shrink-0 grid grid-cols-2/);
  assert.match(builder, /h-\[90dvh\].*max-h-\[calc\(100dvh-env\(safe-area-inset-top\)/s);
  assert.match(builder, /SheetHeader className="shrink-0 border-b/);
});

test("every editable Add Round metric joins the shared workout keyboard path", async () => {
  const [form, builder] = await Promise.all([
    readFile(new URL("components/workouts/SupersetRoundForm.tsx", root), "utf8"),
    readFile(new URL("components/workouts/WorkoutBuilder.tsx", root), "utf8"),
  ]);

  assert.equal((form.match(/\.\.\.keyboardInputProps/g) ?? []).length, 6);
  assert.match(form, /"data-workout-set-input": true/);
  assert.match(form, /data-active-workout-keyboard-spacer/);
  assert.match(form, /entries\.map\(\(entry\) =>/);
  assert.match(builder, /onInputFocus=\{handleWorkoutSetInputFocus\}/);
  assert.match(builder, /onInputBlur=\{handleWorkoutSetInputBlur\}/);
  assert.match(builder, /onInputKeyDown=\{handleWorkoutSetInputKeyDown\}/);
  assert.match(builder, /onInput=\{handleWorkoutSetInputValueInput\}/);
});
