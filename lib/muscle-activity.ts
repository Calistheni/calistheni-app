export const MAIN_MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Legs",
  "Glutes",
  "Cardio",
] as const;

export type MainMuscleGroup = (typeof MAIN_MUSCLE_GROUPS)[number];

export function getMainMuscleGroup(muscle: string): MainMuscleGroup | null {
  const normalized = muscle.toLowerCase();

  if (
    normalized.includes("lat") ||
    normalized.includes("back") ||
    normalized.includes("trap") ||
    normalized.includes("rhomboid")
  ) {
    return "Back";
  }
  if (normalized.includes("bicep")) return "Biceps";
  if (normalized.includes("tricep")) return "Triceps";
  if (normalized.includes("forearm")) return "Forearms";
  if (
    normalized.includes("ab") ||
    normalized.includes("core") ||
    normalized.includes("oblique")
  ) {
    return "Core";
  }
  if (
    normalized.includes("quad") ||
    normalized.includes("hamstring") ||
    normalized.includes("calf") ||
    normalized.includes("leg") ||
    normalized.includes("adductor") ||
    normalized.includes("abductor")
  ) {
    return "Legs";
  }
  if (normalized.includes("glute")) return "Glutes";
  if (normalized.includes("shoulder") || normalized.includes("delt")) {
    return "Shoulders";
  }
  if (normalized.includes("cardio")) return "Cardio";
  if (normalized.includes("chest") || normalized.includes("pec")) {
    return "Chest";
  }

  return null;
}

export function aggregateMuscleActivity(
  exercises: Array<{
    primaryMuscle: string;
    secondaryMuscles: readonly string[];
  }>
) {
  const activity = new Map<MainMuscleGroup, number>();

  for (const exercise of exercises) {
    const trainedGroups = new Set<MainMuscleGroup>();

    for (const muscle of [
      exercise.primaryMuscle,
      ...exercise.secondaryMuscles,
    ]) {
      const group = getMainMuscleGroup(muscle);
      if (group) trainedGroups.add(group);
    }

    for (const group of trainedGroups) {
      activity.set(group, (activity.get(group) ?? 0) + 1);
    }
  }

  return MAIN_MUSCLE_GROUPS.map((muscle) => ({
    muscle,
    sets: activity.get(muscle) ?? 0,
  }));
}
