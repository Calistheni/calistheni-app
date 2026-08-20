export type WorkoutKeyboardScrollMeasurement = {
  inputTop: number;
  inputBottom: number;
  containerTop: number;
  containerBottom: number;
  viewportHeight: number;
  keyboardHeight: number;
  clearance?: number;
};

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
  clearance = 12,
}: WorkoutKeyboardScrollMeasurement) {
  const visibleTop = containerTop + clearance;
  const visibleBottom =
    Math.min(containerBottom, viewportHeight - keyboardHeight) - clearance;

  if (visibleBottom <= visibleTop) return 0;
  if (inputBottom > visibleBottom) return inputBottom - visibleBottom;
  if (inputTop < visibleTop) return inputTop - visibleTop;
  return 0;
}
