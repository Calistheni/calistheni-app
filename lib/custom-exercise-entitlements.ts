export const FREE_CUSTOM_EXERCISE_LIMIT = 7;

// Subscription state will plug into this boundary without changing exercise APIs.
export async function hasUnlimitedCustomExercises(userId: string) {
  void userId;
  return false;
}
