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

/** Converts a zero-based group position to spreadsheet-style lettering: A…Z, AA… */
export function getSupersetLetter(order: number) {
  let value = Math.max(0, Math.floor(order)) + 1;
  let label = "";

  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }

  return label;
}

export function getSupersetDisplayLabel(
  _superset: Pick<WorkoutSupersetInput, "label">,
  order: number
) {
  // Labels are presentation only. Older records may contain the same saved
  // label for multiple groups, so always derive it from the group's order.
  return `Superset ${getSupersetLetter(order)}`;
}

/**
 * Builds React render entries without using an exercise as a proxy for a
 * group. This matters when one exercise belongs to more than one superset:
 * each group remains one sibling with a group-level key.
 */
export function getSupersetRenderEntries<
  TExercise extends { localId: string },
  TSuperset extends { key: string; exerciseLocalIds: string[] },
>(supersets: TSuperset[], exercises: TExercise[]) {
  const groupedExerciseIds = new Set(
    supersets.flatMap((superset) => superset.exerciseLocalIds)
  );

  return [
    ...supersets.flatMap((superset) => {
      const anchorExercise = exercises.find(
        (exercise) => exercise.localId === superset.exerciseLocalIds[0]
      );
      return anchorExercise
        ? [{ kind: "superset" as const, key: `superset-group-${superset.key}`, superset, exercise: anchorExercise }]
        : [];
    }),
    ...exercises
      .filter((exercise) => !groupedExerciseIds.has(exercise.localId))
      .map((exercise) => ({ kind: "exercise" as const, key: `exercise-${exercise.localId}`, exercise })),
  ];
}

export function getSupersetMembershipSortableId(
  supersetKey: string,
  exerciseLocalId: string
) {
  return `superset-membership:${supersetKey}:${exerciseLocalId}`;
}

export function reorderSupersetMembershipIds(
  memberIds: string[],
  activeId: string,
  overId: string
) {
  const activeIndex = memberIds.indexOf(activeId);
  const overIndex = memberIds.indexOf(overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return memberIds;
  const next = [...memberIds];
  const [member] = next.splice(activeIndex, 1);
  next.splice(overIndex, 0, member!);
  return next;
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
