export type WorkoutKeyboardScrollMeasurement = {
  inputTop: number;
  inputBottom: number;
  containerTop: number;
  containerBottom: number;
  viewportHeight: number;
  keyboardHeight: number;
  clearance?: number;
};

export const WORKOUT_KEYBOARD_CLEARANCE = 12;

/**
 * The focused route already has its ordinary safe-area spacing in its content.
 * This adds only the live keyboard overlap plus the visual clearance needed to
 * make the final set row scrollable above the keyboard.
 */
export function getWorkoutKeyboardBottomSpace(
  keyboardHeight: number,
  clearance = WORKOUT_KEYBOARD_CLEARANCE
) {
  if (keyboardHeight <= 0) return 0;
  return Math.max(0, Math.ceil(keyboardHeight) + clearance);
}

/**
 * Returns only the scroll distance required to expose the focused set field.
 * The workout shell is the scroll owner; callers must never use this to move
 * the document or restore an arbitrary pre-keyboard scroll position.
 */
export function getWorkoutKeyboardScrollAdjustment({
  inputTop,
  inputBottom,
  containerTop,
  containerBottom,
  viewportHeight,
  keyboardHeight,
  clearance = WORKOUT_KEYBOARD_CLEARANCE,
}: WorkoutKeyboardScrollMeasurement) {
  const visibleTop = containerTop + clearance;
  const visibleBottom =
    Math.min(containerBottom, viewportHeight - keyboardHeight) - clearance;

  if (visibleBottom <= visibleTop) return 0;
  if (inputBottom > visibleBottom) return inputBottom - visibleBottom;
  if (inputTop < visibleTop) return inputTop - visibleTop;
  return 0;
}
