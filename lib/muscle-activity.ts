export const RADAR_MUSCLE_CATEGORIES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Core",
  "Glutes",
  "Legs",
] as const;

/** @deprecated Use RADAR_MUSCLE_CATEGORIES. */
export const MAIN_MUSCLE_GROUPS = RADAR_MUSCLE_CATEGORIES;

export type RadarMuscleCategory =
  (typeof RADAR_MUSCLE_CATEGORIES)[number];
/** @deprecated Use RadarMuscleCategory. */
export type MainMuscleGroup = RadarMuscleCategory;

export type MuscleWorkloadPoint = {
  muscle: RadarMuscleCategory;
  directSets: number;
  assistingSets: number;
  assistingWorkload: number;
  workloadScore: number;
};

function normalizeMuscleName(muscle: string) {
  return muscle.trim().toLowerCase();
}

export function isCardioMuscle(muscle: string) {
  return normalizeMuscleName(muscle) === "cardio";
}

/**
 * Maps detailed exercise-muscle taxonomy to the eight Profile radar axes.
 * Forearms, Cardio, Full Body, and Neck intentionally remain outside this
 * high-level strength chart.
 */
export function getRadarCategoryForMuscle(
  muscle: string
): RadarMuscleCategory | null {
  const normalized = normalizeMuscleName(muscle);

  if (
    normalized === "cardio" ||
    normalized.includes("forearm") ||
    normalized === "full body" ||
    normalized.includes("neck")
  ) {
    return null;
  }

  if (
    normalized.includes("glute") ||
    normalized.includes("gluteus")
  ) {
    return "Glutes";
  }
  if (
    normalized.includes("quad") ||
    normalized.includes("hamstring") ||
    normalized.includes("calf") ||
    normalized.includes("calves") ||
    normalized.includes("adductor") ||
    normalized.includes("abductor") ||
    normalized.includes("tibialis") ||
    normalized === "legs" ||
    normalized === "leg"
  ) {
    return "Legs";
  }
  if (
    normalized.includes("lat") ||
    normalized.includes("back") ||
    normalized.includes("trap") ||
    normalized.includes("rhomboid")
  ) {
    return "Back";
  }
  if (
    normalized.includes("shoulder") ||
    normalized.includes("delt")
  ) {
    return "Shoulders";
  }
  if (
    normalized.includes("bicep") ||
    normalized.includes("brachialis")
  ) {
    return "Biceps";
  }
  if (normalized.includes("tricep")) return "Triceps";
  if (
    normalized.includes("abdominal") ||
    normalized === "abs" ||
    normalized.includes("core") ||
    normalized.includes("oblique") ||
    normalized.includes("transverse abdominis") ||
    normalized.includes("hip flexor")
  ) {
    return "Core";
  }
  if (
    normalized.includes("chest") ||
    normalized.includes("pectoral") ||
    normalized === "pecs"
  ) {
    return "Chest";
  }

  return null;
}

/** @deprecated Use getRadarCategoryForMuscle. */
export const getMainMuscleGroup = getRadarCategoryForMuscle;

export function getMuscleContributionWeight(
  role: "PRIMARY" | "SECONDARY"
) {
  return role === "PRIMARY" ? 1 : 0.5;
}

/**
 * Aggregates completed-set rows into the eight-category workload score.
 * Callers must query valid completed workout sets for the desired period.
 *
 * Each set contributes at most once per radar category. If primary and
 * secondary muscles from the same set map to one category, PRIMARY wins.
 * Cardio-primary sets are excluded from strength workload entirely.
 */
export function aggregateCompletedSetsByMuscle(
  completedSets: Array<{
    aggregationId?: string | number;
    primaryMuscle: string;
    secondaryMuscles: readonly string[];
  }>
): MuscleWorkloadPoint[] {
  const workload = new Map<
    RadarMuscleCategory,
    { directSets: number; assistingSets: number }
  >();
  const seen = new Set<string | number>();

  for (const set of completedSets) {
    if (set.aggregationId !== undefined) {
      if (seen.has(set.aggregationId)) continue;
      seen.add(set.aggregationId);
    }

    if (isCardioMuscle(set.primaryMuscle)) continue;

    const rolesByCategory = new Map<
      RadarMuscleCategory,
      "PRIMARY" | "SECONDARY"
    >();
    const primaryCategory = getRadarCategoryForMuscle(set.primaryMuscle);

    if (primaryCategory) {
      rolesByCategory.set(primaryCategory, "PRIMARY");
    }

    for (const secondaryMuscle of set.secondaryMuscles) {
      const category = getRadarCategoryForMuscle(secondaryMuscle);
      if (!category || rolesByCategory.get(category) === "PRIMARY") continue;
      rolesByCategory.set(category, "SECONDARY");
    }

    for (const [category, role] of rolesByCategory) {
      const value = workload.get(category) ?? {
        directSets: 0,
        assistingSets: 0,
      };

      if (role === "PRIMARY") {
        value.directSets += 1;
      } else {
        value.assistingSets += 1;
      }
      workload.set(category, value);
    }
  }

  return RADAR_MUSCLE_CATEGORIES.map((muscle) => {
    const value = workload.get(muscle) ?? {
      directSets: 0,
      assistingSets: 0,
    };
    const assistingWorkload =
      value.assistingSets * getMuscleContributionWeight("SECONDARY");
    const workloadScore = value.directSets + assistingWorkload;

    return {
      muscle,
      ...value,
      assistingWorkload,
      workloadScore,
    };
  });
}

export const aggregateMuscleActivity = aggregateCompletedSetsByMuscle;

export function getMuscleWorkloadSummary(
  points: readonly MuscleWorkloadPoint[]
) {
  return [...points].sort(
    (a, b) =>
      b.workloadScore - a.workloadScore ||
      a.muscle.localeCompare(b.muscle)
  );
}
