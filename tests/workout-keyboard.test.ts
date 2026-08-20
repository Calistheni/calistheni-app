import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getWorkoutKeyboardBottomSpace,
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
  assert.match(builder, /getWorkoutKeyboardScrollTarget/);
  assert.match(builder, /getWorkoutKeyboardSpacerRemovalState/);
  assert.match(builder, /--active-workout-keyboard-bottom-space/);
  assert.match(builder, /scrollOwner\.scrollTo\(\{ top: targetScrollTop, behavior: "smooth" \}\)/);
  assert.match(builder, /keyboardScrollRequestRef/);
  assert.match(builder, /cancelAnimationFrame\(keyboardScrollFrameRef\.current\)/);
  assert.match(builder, /scheduleFocusedWorkoutInputVisibility\(true\)/);
  assert.match(builder, /removeWorkoutKeyboardBottomSpaceWhenSafe/);
  assert.match(builder, /keyboardSpacerRemovalPendingRef/);
  assert.match(builder, /data-workout-set-input/);
  assert.match(builder, /event\.key === "Enter"\) event\.currentTarget\.blur\(\)/);
  assert.match(builder, /text-base font-semibold tabular-nums md:text-sm/);
  assert.match(shell, /data-active-workout-scroll-owner/);
  assert.match(shell, /locksViewport && "h-dvh overflow-hidden"/);
  assert.match(styles, /\.app-shell-content-focused-workout \{[\s\S]*padding-bottom: var\(--active-workout-keyboard-bottom-space, 0px\);[\s\S]*scroll-padding-bottom: var\(--active-workout-keyboard-bottom-space, 0px\);[\s\S]*overflow-y: auto;[\s\S]*scroll-behavior: auto;[\s\S]*overflow-anchor: none;/);
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
});
