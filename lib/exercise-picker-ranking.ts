import type { ExerciseListItem } from "@/types/workout";
import type { ExerciseUsage } from "@/lib/workout-exercise-usage";

export function rankExercisesForPicker(
  exercises: ExerciseListItem[],
  usage: ExerciseUsage[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  const usageById = new Map(usage.map((item) => [item.exerciseId, item]));
  const searchScore = (exercise: ExerciseListItem) => {
    if (!normalizedQuery) return 0;
    const name = exercise.name.toLowerCase();
    const muscle = exercise.muscle.toLowerCase();
    if (name === normalizedQuery) return 4;
    if (name.startsWith(normalizedQuery)) return 3;
    if (name.includes(normalizedQuery)) return 2;
    return muscle.includes(normalizedQuery) ? 1 : 0;
  };

  return [...exercises]
    .filter((exercise) => !normalizedQuery || searchScore(exercise) > 0)
    .sort((left, right) => {
      const searchDelta = searchScore(right) - searchScore(left);
      if (searchDelta) return searchDelta;
      const leftUsage = usageById.get(left.id);
      const rightUsage = usageById.get(right.id);
      const countDelta = (rightUsage?.workoutCount ?? 0) - (leftUsage?.workoutCount ?? 0);
      if (countDelta) return countDelta;
      const recentDelta = (rightUsage?.lastUsedAt ?? "").localeCompare(leftUsage?.lastUsedAt ?? "");
      if (recentDelta) return recentDelta;
      return left.muscle.localeCompare(right.muscle) || left.name.localeCompare(right.name);
    });
}

