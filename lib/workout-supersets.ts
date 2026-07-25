import type {
  SupersetColorKey,
  WorkoutSetInput,
  WorkoutSupersetInput,
} from "@/types/workout";

export const SUPERSET_COLOR_KEYS: SupersetColorKey[] = [
  "BLUE",
  "VIOLET",
  "AMBER",
  "GREEN",
];

export const SUPERSET_COLOR_STYLES: Record<
  SupersetColorKey,
  { accent: string; badge: string }
> = {
  BLUE: {
    accent: "bg-blue-500",
    badge: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  VIOLET: {
    accent: "bg-violet-500",
    badge:
      "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  AMBER: {
    accent: "bg-amber-500",
    badge:
      "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  GREEN: {
    accent: "bg-emerald-500",
    badge:
      "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

export function getSupersetLetter(order: number) {
  return String.fromCharCode(65 + (order % 26));
}

export function getSupersetDisplayLabel(
  superset: Pick<WorkoutSupersetInput, "label">,
  order: number
) {
  return superset.label?.trim() || `Superset ${getSupersetLetter(order)}`;
}

export function getNextIncompleteSetIndex(
  sets: Array<Pick<WorkoutSetInput, "completed">>
) {
  const index = sets.findIndex((set) => !set.completed);
  return index >= 0 ? index : null;
}

export function getSupersetRoundProgress(
  exercises: Array<{
    sets: Array<
      Pick<WorkoutSetInput, "completed" | "supersetRoundIndex">
    >;
  }>,
  plannedRounds: number | null = null
) {
  const completedRoundSets = exercises.map(
    (exercise) =>
      new Set(
        exercise.sets.flatMap((set, setIndex) =>
          set.completed ? [set.supersetRoundIndex ?? setIndex] : []
        )
      )
  );
  let completedRounds = 0;
  while (
    completedRoundSets.length > 0 &&
    completedRoundSets.every((rounds) => rounds.has(completedRounds))
  ) {
    completedRounds += 1;
  }
  const complete =
    plannedRounds !== null && completedRounds >= plannedRounds;

  return {
    currentRound: complete ? plannedRounds : completedRounds + 1,
    totalRounds: plannedRounds ?? completedRounds + 1,
    completedRounds,
    complete,
    openEnded: plannedRounds === null,
  };
}

export function getCurrentSupersetRoundEntries<
  T extends {
    sets: Array<
      Pick<WorkoutSetInput, "completed" | "supersetRoundIndex">
    >;
  },
>(exercises: T[], plannedRounds: number | null = null) {
  const progress = getSupersetRoundProgress(exercises, plannedRounds);
  const setIndex = Math.max(0, progress.currentRound - 1);

  return exercises.flatMap((exercise) => {
    const set = exercise.sets[setIndex];

    return set && !set.completed ? [{ exercise, setIndex }] : [];
  });
}

export function createSupersetKey() {
  return `superset-${crypto.randomUUID()}`;
}
