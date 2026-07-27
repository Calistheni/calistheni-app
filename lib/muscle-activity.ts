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

export type MuscleWorkloadPoint = {
  muscle: MainMuscleGroup;
  primarySets: number;
  secondaryContributions: number;
  workloadSets: number;
  /** @deprecated Use workloadSets. Kept for existing dashboard consumers. */
  sets: number;
};

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
    normalized.includes("oblique") ||
    normalized.includes("hip flexor")
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
  if (
    normalized.includes("chest") ||
    normalized.includes("pec") ||
    normalized.includes("upper chest")
  ) {
    return "Chest";
  }

  return null;
}

export function getMuscleContributionWeight(
  role: "PRIMARY" | "SECONDARY"
) {
  return role === "PRIMARY" ? 1 : 0.5;
}

/**
 * Aggregates completed-set rows into workload. Callers are responsible for
 * querying only valid, completed workout sets in the desired reporting period.
 * A main group receives at most one contribution per role for each set, and a
 * secondary alias never adds workload to that set's primary main group.
 */
export function aggregateCompletedSetsByMuscle(
  completedSets: Array<{
    aggregationId?: string | number;
    primaryMuscle: string;
    secondaryMuscles: readonly string[];
  }>
): MuscleWorkloadPoint[] {
  const workload = new Map<
    MainMuscleGroup,
    { primarySets: number; secondaryContributions: number }
  >();
  const seen = new Set<string | number>();

  for (const set of completedSets) {
    if (set.aggregationId !== undefined) {
      if (seen.has(set.aggregationId)) continue;
      seen.add(set.aggregationId);
    }

    const primaryGroup = getMainMuscleGroup(set.primaryMuscle);
    if (primaryGroup) {
      const value = workload.get(primaryGroup) ?? {
        primarySets: 0,
        secondaryContributions: 0,
      };
      value.primarySets += 1;
      workload.set(primaryGroup, value);
    }

    const secondaryGroups = new Set(
      set.secondaryMuscles
        .map(getMainMuscleGroup)
        .filter((group): group is MainMuscleGroup => Boolean(group))
    );

    if (primaryGroup) secondaryGroups.delete(primaryGroup);

    for (const group of secondaryGroups) {
      const value = workload.get(group) ?? {
        primarySets: 0,
        secondaryContributions: 0,
      };
      value.secondaryContributions += 1;
      workload.set(group, value);
    }
  }

  return MAIN_MUSCLE_GROUPS.map((muscle) => {
    const value = workload.get(muscle) ?? {
      primarySets: 0,
      secondaryContributions: 0,
    };
    const workloadSets =
      value.primarySets +
      value.secondaryContributions *
        getMuscleContributionWeight("SECONDARY");

    return {
      muscle,
      ...value,
      workloadSets,
      sets: workloadSets,
    };
  });
}

export const aggregateMuscleActivity = aggregateCompletedSetsByMuscle;

export function getMuscleWorkloadSummary(
  points: readonly MuscleWorkloadPoint[]
) {
  return [...points].sort(
    (a, b) =>
      b.workloadSets - a.workloadSets || a.muscle.localeCompare(b.muscle)
  );
}
