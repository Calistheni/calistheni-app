import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getNativeKeyboardSafeBottom,
  getNativeKeyboardVisibilityAdjustment,
} from "@/lib/native/keyboard-visibility";

const root = new URL("../", import.meta.url);

test("native keyboard geometry does not subtract keyboard height twice", () => {
  assert.equal(
    getNativeKeyboardSafeBottom({
      innerHeight: 844,
      keyboardHeight: 300,
      visualViewportHeight: 544,
    }),
    532
  );
  assert.equal(
    getNativeKeyboardSafeBottom({
      innerHeight: 844,
      keyboardHeight: 300,
      visualViewportHeight: 844,
    }),
    532
  );
});

test("full focused control is moved above the keyboard with margin", () => {
  assert.equal(
    getNativeKeyboardVisibilityAdjustment({
      inputTop: 500,
      inputBottom: 548,
      visibleTop: 12,
      visibleBottom: 532,
    }),
    16
  );
  assert.equal(
    getNativeKeyboardVisibilityAdjustment({
      inputTop: 450,
      inputBottom: 498,
      visibleTop: 12,
      visibleBottom: 532,
    }),
    0
  );
});

test("shared native visibility uses the nearest owner and excludes active workout", async () => {
  const [helper, shell, workout, scrollArea] = await Promise.all([
    readFile(new URL("lib/native/keyboard-visibility.ts", root), "utf8"),
    readFile(new URL("components/native/NativeShell.tsx", root), "utf8"),
    readFile(new URL("components/workouts/WorkoutBuilder.tsx", root), "utf8"),
    readFile(new URL("components/ui/scroll-area.tsx", root), "utf8"),
  ]);

  assert.match(shell, /useNativeKeyboardVisibility\(\)/);
  assert.match(helper, /focusedInput = event\.target/);
  assert.match(helper, /findNativeKeyboardScrollOwner\(input\)/);
  assert.match(helper, /data-keyboard-scroll-owner/);
  assert.doesNotMatch(helper, /hasAttribute\("data-keyboard-dismiss-on-scroll"\)/);
  assert.match(helper, /document\.scrollingElement/);
  assert.match(helper, /inputBottom > visibleBottom/);
  assert.match(helper, /data-active-workout-scroll-owner/);
  assert.match(helper, /dataset\.nativeKeyboardSpacer = "true"/);
  assert.match(helper, /Keyboard\.addListener\("keyboardDidShow"/);
  assert.doesNotMatch(helper, /onChange|input value|window\.scrollTo|setTimeout/);
  assert.match(workout, /CapacitorKeyboard\.setScroll\(\{ isDisabled: true \}\)/);
  assert.match(scrollArea, /ScrollAreaPrimitive\.Viewport data-keyboard-scroll-owner/);
});
