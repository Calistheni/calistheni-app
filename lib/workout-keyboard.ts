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

export function getWorkoutKeyboardScrollTarget({
  scrollTop,
  scrollHeight,
  clientHeight,
  adjustment,
}: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  adjustment: number;
}) {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  return Math.min(maxScrollTop, Math.max(0, scrollTop + adjustment));
}

/**
 * Returns the spacer height required to make the requested adjustment
 * reachable. Adding the measured deficit to the current spacer is important
 * for short content: a new spacer can first fill unused client-height space
 * without increasing scrollHeight at all.
 */
export function getWorkoutKeyboardRequiredBottomSpace({
  currentBottomSpace,
  scrollTop,
  scrollHeight,
  clientHeight,
  adjustment,
}: {
  currentBottomSpace: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  adjustment: number;
}) {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const requestedScrollTop = Math.max(0, scrollTop + adjustment);
  const missingRange = Math.max(0, requestedScrollTop - maxScrollTop);

  return Math.ceil(currentBottomSpace + missingRange);
}

export function getWorkoutKeyboardSpacerRemovalState({
  scrollTop,
  scrollHeight,
  clientHeight,
  keyboardBottomSpace,
}: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  keyboardBottomSpace: number;
}) {
  const maxScrollTopWithoutSpacer = Math.max(
    0,
    scrollHeight - keyboardBottomSpace - clientHeight
  );
  return {
    maxScrollTopWithoutSpacer,
    canRemoveSpacer: scrollTop <= maxScrollTopWithoutSpacer + 1,
  };
}
