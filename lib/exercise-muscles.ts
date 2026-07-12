export const EXERCISE_MUSCLE_GROUPS = [
  "Abdominals",
  "Abductors",
  "Adductors",
  "Biceps",
  "Calves",
  "Cardio",
  "Chest",
  "Forearms",
  "Full Body",
  "Glutes",
  "Hamstrings",
  "Lats",
  "Lower Back",
  "Neck",
  "Quadriceps",
  "Shoulders",
  "Traps",
  "Triceps",
  "Upper Back",
] as const;

export type ExerciseMuscleGroup = (typeof EXERCISE_MUSCLE_GROUPS)[number];

export function normalizeSecondaryMuscles(
  primaryMuscle: string,
  secondaryMuscles: readonly string[]
) {
  return [...new Set(secondaryMuscles)].filter(
    (muscle) => muscle !== primaryMuscle
  );
}
