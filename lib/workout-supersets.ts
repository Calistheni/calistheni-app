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

export function getNextSupersetSetDraft<T extends {
  completed: boolean;
}>(sets: T[]) {
  const reusableIndex = sets.findIndex((set) => !set.completed);

  if (reusableIndex >= 0) {
    return {
      setIndex: reusableIndex,
      setNumber: reusableIndex + 1,
      source: sets[reusableIndex] ?? null,
    };
  }

  return {
    setIndex: -1,
    // -1 is an internal append sentinel only. Never expose it as a UI index.
    setNumber: sets.length + 1,
    source: [...sets].reverse().find((set) => set.completed) ?? null,
  };
}

export function isOpenEndedSuperset(hardRoundLimit: number | null) {
  return hardRoundLimit === null;
}

export function hasReachedHardRoundLimit(
  hardRoundLimit: number | null,
  completedRounds: number
) {
  return (
    hardRoundLimit !== null && completedRounds >= hardRoundLimit
  );
}

export function getSupersetRoundProgress(
  exercises: Array<{
    sets: Array<{
      completed: boolean;
      supersetRoundIndex?: number | null;
      supersetRoundId?: string | null;
    }>;
  }>,
  options: {
    hardRoundLimit?: number | null;
    supersetKey?: string;
  } = {}
) {
  const hardRoundLimit = options.hardRoundLimit ?? null;
  // New records use a shared stable ID so individual sets never advance a
  // superset round. Legacy records use the old round index as a fallback.
  const completedRoundSets = exercises.map((exercise) => {
    const hasExplicitRoundMetadata = exercise.sets.some(
      (set) =>
        Boolean(set.supersetRoundId) ||
        set.supersetRoundIndex !== null && set.supersetRoundIndex !== undefined
    );
    return new Set(
      exercise.sets.flatMap((set, setIndex) => {
        if (!set.completed) return [];
        if (set.supersetRoundId) {
          return options.supersetKey &&
            !set.supersetRoundId.startsWith(`${options.supersetKey}:`)
            ? []
            : [set.supersetRoundId];
        }
        if (
          set.supersetRoundIndex !== null &&
          set.supersetRoundIndex !== undefined
        ) {
          return [`legacy:${set.supersetRoundIndex}`];
        }
        return hasExplicitRoundMetadata ? [] : [`legacy:${setIndex}`];
      })
    );
  });
  // A complete round is an ID present for every member. The order is not
  // inferred from a set array, so manual sets cannot inflate this value.
  const commonRoundIds = completedRoundSets.length
    ? [...completedRoundSets[0]].filter((roundId) =>
        completedRoundSets.every((rounds) => rounds.has(roundId))
      )
    : [];
  const completedRounds = commonRoundIds.length;
  const complete = hasReachedHardRoundLimit(
    hardRoundLimit,
    completedRounds
  );

  return {
    currentRound:
      complete && hardRoundLimit !== null
        ? hardRoundLimit
        : completedRounds + 1,
    totalRounds: hardRoundLimit ?? completedRounds + 1,
    completedRounds,
    complete,
    openEnded: isOpenEndedSuperset(hardRoundLimit),
  };
}

export function getNextSupersetRoundIndex(
  exercises: Array<{
    sets: Array<{
      completed: boolean;
      supersetRoundIndex?: number | null;
      supersetRoundId?: string | null;
    }>;
  }>,
  hardRoundLimit: number | null = null,
  supersetKey?: string
) {
  const progress = getSupersetRoundProgress(exercises, {
    hardRoundLimit,
    supersetKey,
  });

  return progress.complete ? null : progress.completedRounds;
}

export function getCurrentSupersetRoundEntries<
  T extends {
    sets: Array<{
      completed: boolean;
      supersetRoundIndex?: number | null;
      supersetRoundId?: string | null;
    }>;
  },
>(
  exercises: T[],
  options: {
    hardRoundLimit?: number | null;
    supersetKey?: string;
  } = {}
) {
  const progress = getSupersetRoundProgress(exercises, options);
  if (progress.complete) return [];
  return exercises.flatMap((exercise) => {
    const setIndex = exercise.sets.findIndex((set) => !set.completed);
    const set = setIndex >= 0 ? exercise.sets[setIndex] : null;
    return set ? [{ exercise, setIndex }] : [];
  });
}

export function createSupersetKey() {
  return `superset-${crypto.randomUUID()}`;
}
