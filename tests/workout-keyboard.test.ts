import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getWorkoutKeyboardBottomSpace,
  getWorkoutKeyboardRequiredBottomSpace,
  getWorkoutKeyboardScrollAdjustment,
  getWorkoutKeyboardSpacerRemovalState,
  getWorkoutKeyboardScrollTarget,
} from "@/lib/workout-keyboard";

const root = new URL("../", import.meta.url);

test("workout keyboard adjustment leaves an already-visible field stationary", () => {
  assert.equal(
    getWorkoutKeyboardScrollAdjustment({
      inputTop: 180,
      inputBottom: 212,
      containerTop: 0,
      containerBottom: 800,
      viewportHeight: 800,
      keyboardHeight: 300,
    }),
    0
  );
});

test("workout keyboard adjustment uses only the minimum scroll needed", () => {
  assert.equal(
    getWorkoutKeyboardScrollAdjustment({
      inputTop: 470,
      inputBottom: 502,
      containerTop: 0,
      containerBottom: 800,
      viewportHeight: 800,
      keyboardHeight: 300,
    }),
    14
  );
});

test("keyboard-visible workout space extends the final row's scroll range only while needed", () => {
  const adjustment = getWorkoutKeyboardScrollAdjustment({
    inputTop: 748,
    inputBottom: 780,
    containerTop: 0,
    containerBottom: 800,
    viewportHeight: 800,
    keyboardHeight: 300,
  });

  assert.equal(getWorkoutKeyboardBottomSpace(300), 312);
  assert.ok(getWorkoutKeyboardBottomSpace(300) >= adjustment);
  assert.equal(getWorkoutKeyboardBottomSpace(0), 0);
});

test("a short two-exercise superset gets real scroll range for its second exercise", () => {
  const clientHeight = 800;
  const contentHeight = 650;
  const keyboardHeight = 300;
  const adjustment = getWorkoutKeyboardScrollAdjustment({
    inputTop: 588,
    inputBottom: 620,
    containerTop: 0,
    containerBottom: clientHeight,
    viewportHeight: clientHeight,
    keyboardHeight,
  });
  const scrollHeightWithSpacer =
    contentHeight + getWorkoutKeyboardBottomSpace(keyboardHeight);

  assert.equal(adjustment, 132);
  assert.ok(scrollHeightWithSpacer - clientHeight >= adjustment);
});

test("short content grows the existing spacer by the unavailable scroll range", () => {
  assert.equal(
    getWorkoutKeyboardRequiredBottomSpace({
      currentBottomSpace: 312,
      scrollTop: 0,
      scrollHeight: 800,
      clientHeight: 800,
      adjustment: 132,
    }),
    444
  );
});

test("A1, A2, and later-round fields use the same full-rectangle geometry", () => {
  const fields = [
    { label: "A1 round 1", top: 450, bottom: 498, expected: 10 },
    { label: "A2 round 1", top: 588, bottom: 636, expected: 148 },
    { label: "A1 round 3", top: 706, bottom: 754, expected: 266 },
    { label: "A2 round 3", top: 764, bottom: 812, expected: 324 },
  ];

  for (const field of fields) {
    assert.equal(
      getWorkoutKeyboardScrollAdjustment({
        inputTop: field.top,
        inputBottom: field.bottom,
        containerTop: 0,
        containerBottom: 800,
        viewportHeight: 800,
        keyboardHeight: 300,
      }),
      field.expected,
      field.label
    );
  }
});

test("filled normal and larger-superset layouts keep their existing spacer and minimal target", () => {
  const measurement = {
    currentBottomSpace: 312,
    scrollTop: 220,
    scrollHeight: 1500,
    clientHeight: 800,
    adjustment: 34,
  };

  assert.equal(getWorkoutKeyboardRequiredBottomSpace(measurement), 312);
  assert.equal(
    getWorkoutKeyboardScrollTarget({
      scrollTop: measurement.scrollTop,
      scrollHeight: measurement.scrollHeight,
      clientHeight: measurement.clientHeight,
      adjustment: measurement.adjustment,
    }),
    254
  );
});

test("both exercises in every superset use the shared keyboard-aware set table", async () => {
  const builder = await readFile(
    new URL("components/workouts/WorkoutBuilder.tsx", root),
    "utf8"
  );
  const supersetRow = builder.slice(
    builder.indexOf("function renderSupersetExerciseRow"),
    builder.indexOf("function closeSupersetRoundForm")
  );
  const setTable = builder.slice(
    builder.indexOf("function renderExerciseSetTable"),
    builder.indexOf("function renderSupersetExerciseRow")
  );

  assert.match(supersetRow, /renderExerciseSetTable\(selectedExercise, exercise\)/);
  assert.match(setTable, /data-workout-set-input/);
  assert.match(setTable, /onFocus=\{handleWorkoutSetInputFocus\}/);
});

test("workout keyboard scrolling computes one clamped target", () => {
  assert.equal(
    getWorkoutKeyboardScrollTarget({
      scrollTop: 120,
      scrollHeight: 1400,
      clientHeight: 600,
      adjustment: 90,
    }),
    210
  );
  assert.equal(
    getWorkoutKeyboardScrollTarget({
      scrollTop: 780,
      scrollHeight: 1400,
      clientHeight: 600,
      adjustment: 90,
    }),
    800
  );
  assert.equal(
    getWorkoutKeyboardScrollTarget({
      scrollTop: 20,
      scrollHeight: 1400,
      clientHeight: 600,
      adjustment: -100,
    }),
    0
  );
});

test("keyboard spacer removal never clamps an active final row", () => {
  assert.deepEqual(
    getWorkoutKeyboardSpacerRemovalState({
      scrollTop: 460,
      scrollHeight: 1400,
      clientHeight: 600,
      keyboardBottomSpace: 312,
    }),
    { maxScrollTopWithoutSpacer: 488, canRemoveSpacer: true }
  );
  assert.deepEqual(
    getWorkoutKeyboardSpacerRemovalState({
      scrollTop: 750,
      scrollHeight: 1400,
      clientHeight: 600,
      keyboardBottomSpace: 312,
    }),
    { maxScrollTopWithoutSpacer: 488, canRemoveSpacer: false }
  );
});

test("active workout owns keyboard accommodation in its internal shell", async () => {
  const [builder, shell, styles, nativeShell] = await Promise.all([
    readFile(new URL("components/workouts/WorkoutBuilder.tsx", root), "utf8"),
    readFile(new URL("components/navigation/AppShell.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("components/native/NativeShell.tsx", root), "utf8"),
  ]);

  assert.match(builder, /Keyboard as CapacitorKeyboard/);
  assert.match(builder, /keyboardDidShow/);
  assert.match(builder, /getWorkoutKeyboardScrollAdjustment/);
  assert.match(builder, /getWorkoutKeyboardBottomSpace/);
  assert.match(builder, /getWorkoutKeyboardRequiredBottomSpace/);
  assert.match(builder, /getWorkoutKeyboardScrollTarget/);
  assert.match(builder, /getWorkoutKeyboardSpacerRemovalState/);
  assert.match(builder, /--active-workout-keyboard-bottom-space/);
  assert.match(builder, /scrollOwner\.scrollTo\(\{ top: targetScrollTop, behavior: "smooth" \}\)/);
  assert.match(builder, /keyboardScrollRequestRef/);
  assert.match(builder, /cancelAnimationFrame\(keyboardScrollFrameRef\.current\)/);
  assert.match(
    builder,
    /focusedWorkoutInputRef\.current = event\.currentTarget;[\s\S]*if \(keyboardVisibleRef\.current\) \{[\s\S]*scheduleFocusedWorkoutInputVisibility\(\);/
  );
  assert.match(
    builder,
    /keyboardDidShow[\s\S]*setWorkoutKeyboardBottomSpace\(keyboardHeight\);[\s\S]*setWorkoutKeyboardLayoutVersion\(\(current\) => current \+ 1\);/
  );
  assert.match(
    builder,
    /useLayoutEffect\(\(\) => \{[\s\S]*workoutKeyboardLayoutVersion[\s\S]*scheduleFocusedWorkoutInputVisibility\(\);/
  );
  const inputHandlers = builder.slice(
    builder.indexOf('data-workout-set-input'),
    builder.indexOf('aria-label={pr?.isNew')
  );
  assert.match(inputHandlers, /onChange=\{[\s\S]*updateSet[\s\S]*\}/);
  assert.doesNotMatch(inputHandlers, /onChange=\{[\s\S]*scheduleFocusedWorkoutInputVisibility/);
  const blurHandler = builder.slice(
    builder.indexOf('const handleWorkoutSetInputBlur'),
    builder.indexOf('const handleWorkoutSetInputKeyDown')
  );
  assert.doesNotMatch(blurHandler, /focusedWorkoutInputRef\.current = null/);
  assert.match(builder, /keyboardDidHide[\s\S]*focusedWorkoutInputRef\.current = null;/);
  assert.match(builder, /removeWorkoutKeyboardBottomSpaceWhenSafe/);
  assert.match(builder, /keyboardSpacerRemovalPendingRef/);
  assert.match(builder, /data-workout-set-input/);
  assert.match(builder, /input\?\.closest<HTMLElement>\([\s\S]*data-active-workout-scroll-owner/);
  assert.match(
    builder,
    /requiredBottomSpace > keyboardBottomSpaceRef\.current \+ 1[\s\S]*setProperty\([\s\S]*return true;/
  );
  assert.match(
    builder,
    /const spacerChanged = keepFocusedWorkoutInputVisible\(requestId\);[\s\S]*if \(spacerChanged[\s\S]*requestAnimationFrame/
  );
  assert.match(builder, /event\.key === "Enter"\) event\.currentTarget\.blur\(\)/);
  assert.match(builder, /text-base font-semibold tabular-nums md:text-sm/);
  assert.match(shell, /data-active-workout-scroll-owner/);
  assert.match(shell, /locksViewport && "h-dvh overflow-hidden"/);
  assert.match(styles, /\.app-shell-content-focused-workout \{[\s\S]*scroll-padding-bottom: var\(--active-workout-keyboard-bottom-space, 0px\);[\s\S]*overflow-y: auto;[\s\S]*scroll-behavior: auto;[\s\S]*overflow-anchor: none;/);
  assert.match(styles, /\.app-shell-content-focused-workout \{[^}]*\n\s+padding-bottom: 0;/);
  assert.doesNotMatch(styles, /\.app-shell-content-focused-workout \{[^}]*\n\s+padding-bottom: var\(--active-workout-keyboard-bottom-space/);
  assert.match(builder, /data-active-workout-keyboard-spacer[\s\S]*height: "var\(--active-workout-keyboard-bottom-space, 0px\)"/);
  assert.match(
    styles,
    /html\[data-native-app\]:has\(\[data-active-workout-scroll-owner\]\),[\s\S]*overflow: hidden;/
  );
  assert.doesNotMatch(
    builder.slice(
      builder.indexOf("const keepFocusedWorkoutInputVisible"),
      builder.indexOf("const handleWorkoutSetInputFocus")
    ),
    /scrollIntoView|window\.scrollTo/
  );
  assert.match(
    nativeShell,
    /target\?\.closest\('input, textarea, select, \[contenteditable="true"\]'\)/
  );
  assert.doesNotMatch(nativeShell, /Keyboard\.setScroll/);
  assert.match(
    builder,
    /if \(isEditing \|\| !isIOSApp\(\)\) return;[\s\S]*CapacitorKeyboard\.setScroll\(\{ isDisabled: true \}\)/
  );
  assert.match(
    builder,
    /return \(\) => \{[\s\S]*CapacitorKeyboard\.setScroll\(\{ isDisabled: false \}\)/
  );
  assert.doesNotMatch(builder, /window\.scrollTo/);
});
