import { prisma } from "@/lib/prisma";
import type { ValidRoutineMutation } from "@/lib/validation/routines";
import type { RoutineDetail } from "@/types/routine";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import {
  canCreateRoutine,
  FREE_ROUTINE_LIMIT,
  getUserEntitlements,
} from "@/lib/entitlements";
import type { Prisma } from "@/lib/generated/prisma/client";
import { sanitizeRoutineSetForTrackingType } from "@/lib/exercise-tracking-fields";
import { resolveRoutineSupersetMemberships } from "@/lib/routine-superset-mapping";

export { FREE_ROUTINE_LIMIT } from "@/lib/entitlements";

export const routineInclude = {
  supersets: {
    orderBy: {
      order: "asc" as const,
    },
  },
  exercises: {
    orderBy: {
      order: "asc" as const,
    },
    include: {
      exercise: true,
      sets: {
        orderBy: {
          order: "asc" as const,
        },
      },
    },
  },
};

function mapExercise(exercise: {
  id: string;
  slug: string;
  name: string;
  muscle: string;
  secondaryMuscles: string[];
  thumbnailUrl: string | null;
  videoUrl: string | null;
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
  createdByUserId: string | null;
}): ExerciseListItem {
  return {
    id: exercise.id,
    slug: exercise.slug,
    name: exercise.name,
    muscle: exercise.muscle,
    secondaryMuscles: exercise.secondaryMuscles,
    thumbnailUrl: exercise.thumbnailUrl,
    videoUrl: exercise.videoUrl,
    trackingType: exercise.trackingType,
    bodyweightLoadFactor: exercise.bodyweightLoadFactor,
    createdByUserId: exercise.createdByUserId,
  };
}

export function mapRoutineDetail(template: {
  id: number;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: Date;
  updatedAt: Date;
  supersets: Array<{
    id: string;
    order: number;
    label: string | null;
    colorKey: "BLUE" | "VIOLET" | "AMBER" | "GREEN";
    restSeconds: number | null;
    plannedRounds: number | null;
  }>;
  exercises: Array<{
    id: number;
    restSeconds: number | null;
    notes: string | null;
    supersetId: string | null;
    supersetPosition: number | null;
    exercise: Parameters<typeof mapExercise>[0];
    sets: Array<{
      id: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
      distanceMeters: number | null;
      steps: number | null;
      floors: number | null;
    }>;
  }>;
}): RoutineDetail {
  const clientExerciseIds = new Map(
    template.exercises.map((exercise) => [
      exercise.id,
      `routine-exercise-${exercise.id}`,
    ])
  );

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    supersets: template.supersets.map((superset) => ({
      id: superset.id,
      key: superset.id,
      label: superset.label,
      colorKey: superset.colorKey,
      restSeconds: superset.restSeconds,
      plannedRounds: superset.plannedRounds,
      exerciseClientIds: template.exercises
        .filter((exercise) => exercise.supersetId === superset.id)
        .sort(
          (left, right) =>
            (left.supersetPosition ?? 0) - (right.supersetPosition ?? 0)
        )
        .map(
          (exercise) =>
            clientExerciseIds.get(exercise.id) ??
            `routine-exercise-${exercise.id}`
        ),
    })),
    exercises: template.exercises.map((templateExercise) => {
      const trackingType = templateExercise.exercise.trackingType;

      return {
        id: templateExercise.id,
        clientExerciseId:
          clientExerciseIds.get(templateExercise.id) ??
          `routine-exercise-${templateExercise.id}`,
        restSeconds: templateExercise.restSeconds,
        notes: templateExercise.notes,
        supersetKey: templateExercise.supersetId,
        supersetPosition: templateExercise.supersetPosition,
        exercise: mapExercise(templateExercise.exercise),
        sets: templateExercise.sets.map((set) => ({
          id: set.id,
          ...sanitizeRoutineSetForTrackingType(
            {
              reps: set.reps,
              weightKg: set.weightKg,
              durationSec: set.durationSec,
              distanceMeters: set.distanceMeters,
              steps: set.steps,
              floors: set.floors,
            },
            trackingType
          ),
        })),
      };
    }),
  };
}

async function getExerciseTrackingTypes(
  userId: string,
  exerciseIds: string[]
) {
  const uniqueExerciseIds = [...new Set(exerciseIds)];
  const exercises = await prisma.exercise.findMany({
    where: {
      id: {
        in: uniqueExerciseIds,
      },
      ...exerciseVisibilityWhere(userId),
    },
    select: {
      id: true,
      trackingType: true,
    },
  });

  return exercises.length === uniqueExerciseIds.length
    ? new Map(
        exercises.map((exercise) => [exercise.id, exercise.trackingType])
      )
    : null;
}

function normalizeRoutineTrackingValues(
  payload: ValidRoutineMutation,
  trackingTypes: Map<string, ExerciseTrackingType>
): ValidRoutineMutation {
  return {
    ...payload,
    exercises: payload.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        sanitizeRoutineSetForTrackingType(
          set,
          trackingTypes.get(exercise.exerciseId) ?? "NOT_SELECTED"
        )
      ),
    })),
  };
}

function buildRoutineMetadata(payload: ValidRoutineMutation) {
  return {
    name: payload.name,
    description: payload.description,
    visibility: payload.visibility,
  };
}

async function createRoutineChildren(
  tx: Prisma.TransactionClient,
  templateId: number,
  payload: ValidRoutineMutation
) {
  const persistedExerciseIds = new Map<string, number>();

  for (const [exerciseIndex, exercise] of payload.exercises.entries()) {
    const persistedExercise = await tx.workoutTemplateExercise.create({
      data: {
        templateId,
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes,
      },
      select: {
        id: true,
      },
    });
    persistedExerciseIds.set(
      exercise.clientExerciseId,
      persistedExercise.id
    );
  }

  const resolvedSupersets = resolveRoutineSupersetMemberships(
    payload.supersets,
    persistedExerciseIds
  );

  for (const [supersetIndex, resolvedSuperset] of
    resolvedSupersets.entries()) {
    const superset = payload.supersets[supersetIndex];
    const persistedSupersetId = `routine-superset-${crypto.randomUUID()}`;

    await tx.workoutTemplateSuperset.create({
      data: {
        templateId,
        id: persistedSupersetId,
        order: supersetIndex,
        label: superset.label,
        colorKey: superset.colorKey,
        restSeconds: superset.restSeconds,
        plannedRounds: superset.plannedRounds,
      },
    });

    for (const member of resolvedSuperset.members) {
      await tx.workoutTemplateExercise.update({
        where: {
          id: member.persistedExerciseId,
        },
        data: {
          supersetId: persistedSupersetId,
          supersetPosition: member.position,
        },
      });
    }
  }

  for (const exercise of payload.exercises) {
    const persistedExerciseId = persistedExerciseIds.get(
      exercise.clientExerciseId
    );

    if (!persistedExerciseId) {
      throw new Error(`Unresolved exercise ${exercise.clientExerciseId}`);
    }

    await tx.workoutTemplateSet.createMany({
      data: exercise.sets.map((set, setIndex) => ({
        templateExerciseId: persistedExerciseId,
        order: setIndex,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSec: set.durationSec,
        distanceMeters: set.distanceMeters,
        steps: set.steps,
        floors: set.floors,
      })),
    });
  }
}

export async function createUserRoutine(
  userId: string,
  payload: ValidRoutineMutation
) {
  if (payload.exercises.some((exercise) => exercise.routineExerciseId !== null)) {
    return {
      code: "UNRESOLVED_ROUTINE_EXERCISE",
      error: "A new routine cannot reference an existing routine exercise.",
    } as const;
  }

  const trackingTypes = await getExerciseTrackingTypes(
    userId,
    payload.exercises.map((item) => item.exerciseId)
  );
  if (!trackingTypes) {
    return { error: "One or more exercises were not found." } as const;
  }
  const normalizedPayload = normalizeRoutineTrackingValues(
    payload,
    trackingTypes
  );

  const { entitlements } = await getUserEntitlements(userId);
  const routine = await prisma.$transaction(
    async (tx) => {
      const routineCount = await tx.workoutTemplate.count({ where: { userId } });

      if (!canCreateRoutine(entitlements, routineCount)) return null;

      const routine = await tx.workoutTemplate.create({
        data: {
          userId,
          ...buildRoutineMetadata(normalizedPayload),
        },
        select: { id: true },
      });
      await createRoutineChildren(tx, routine.id, normalizedPayload);
      return tx.workoutTemplate.findUniqueOrThrow({
        where: { id: routine.id },
        include: routineInclude,
      });
    },
    { isolationLevel: "Serializable" }
  );

  if (!routine) {
    return {
      code: "ROUTINE_LIMIT_REACHED",
      error: `You've reached the Free limit of ${FREE_ROUTINE_LIMIT} routines.`,
    } as const;
  }

  return { routine: mapRoutineDetail(routine) } as const;
}

export async function updateUserRoutine(
  userId: string,
  routineId: number,
  payload: ValidRoutineMutation
) {
  const trackingTypes = await getExerciseTrackingTypes(
    userId,
    payload.exercises.map((item) => item.exerciseId)
  );
  if (!trackingTypes) {
    return { error: "One or more exercises were not found." } as const;
  }
  const normalizedPayload = normalizeRoutineTrackingValues(
    payload,
    trackingTypes
  );

  const existingRoutine = await prisma.workoutTemplate.findFirst({
    where: {
      id: routineId,
      userId,
    },
    select: {
      id: true,
      exercises: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!existingRoutine) {
    return { error: "Routine not found." } as const;
  }

  const existingExerciseIds = new Set(
    existingRoutine.exercises.map((exercise) => exercise.id)
  );
  if (
    payload.exercises.some(
      (exercise) =>
        exercise.routineExerciseId !== null &&
        !existingExerciseIds.has(exercise.routineExerciseId)
    )
  ) {
    return {
      code: "UNRESOLVED_ROUTINE_EXERCISE",
      error: "A routine exercise could not be resolved for this routine.",
    } as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workoutTemplateExercise.deleteMany({
      where: {
        templateId: routineId,
      },
    });
    await tx.workoutTemplateSuperset.deleteMany({
      where: {
        templateId: routineId,
      },
    });

    await tx.workoutTemplate.update({
      where: {
        id: routineId,
      },
      data: buildRoutineMetadata(normalizedPayload),
    });
    await createRoutineChildren(tx, routineId, normalizedPayload);
  });

  const routine = await prisma.workoutTemplate.findFirst({
    where: {
      id: routineId,
      userId,
    },
    include: routineInclude,
  });

  return routine
    ? ({ routine: mapRoutineDetail(routine) } as const)
    : ({ error: "Routine not found." } as const);
}
