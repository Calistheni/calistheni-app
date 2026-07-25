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
    }>;
  }>;
}): RoutineDetail {
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
    })),
    exercises: template.exercises.map((templateExercise) => ({
      id: templateExercise.id,
      restSeconds: templateExercise.restSeconds,
      notes: templateExercise.notes,
      supersetKey: templateExercise.supersetId,
      supersetPosition: templateExercise.supersetPosition,
      exercise: mapExercise(templateExercise.exercise),
      sets: templateExercise.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSec: set.durationSec,
      })),
    })),
  };
}

async function assertExercisesExist(userId: string, exerciseIds: string[]) {
  const uniqueExerciseIds = [...new Set(exerciseIds)];
  const existingCount = await prisma.exercise.count({
    where: {
      id: {
        in: uniqueExerciseIds,
      },
      ...exerciseVisibilityWhere(userId),
    },
  });

  return existingCount === uniqueExerciseIds.length;
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
  if (payload.supersets.length > 0) {
    await tx.workoutTemplateSuperset.createMany({
      data: payload.supersets.map((superset, supersetIndex) => ({
        id: superset.key,
        templateId,
        order: supersetIndex,
        label: superset.label,
        colorKey: superset.colorKey,
        restSeconds: superset.restSeconds,
        plannedRounds: superset.plannedRounds,
      })),
    });
  }

  for (const [exerciseIndex, exercise] of payload.exercises.entries()) {
    await tx.workoutTemplateExercise.create({
      data: {
        templateId,
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes,
        supersetId: exercise.supersetKey,
        supersetPosition: exercise.supersetPosition,
        sets: {
          create: exercise.sets.map((set, setIndex) => ({
            order: setIndex,
            reps: set.reps,
            weightKg: set.weightKg,
            durationSec: set.durationSec,
          })),
        },
      },
    });
  }
}

export async function createUserRoutine(
  userId: string,
  payload: ValidRoutineMutation
) {
  if (!(await assertExercisesExist(userId, payload.exercises.map((item) => item.exerciseId)))) {
    return { error: "One or more exercises were not found." } as const;
  }

  const { entitlements } = await getUserEntitlements(userId);
  const routine = await prisma.$transaction(
    async (tx) => {
      const routineCount = await tx.workoutTemplate.count({ where: { userId } });

      if (!canCreateRoutine(entitlements, routineCount)) return null;

      const routine = await tx.workoutTemplate.create({
        data: {
          userId,
          ...buildRoutineMetadata(payload),
        },
        select: { id: true },
      });
      await createRoutineChildren(tx, routine.id, payload);
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
  if (!(await assertExercisesExist(userId, payload.exercises.map((item) => item.exerciseId)))) {
    return { error: "One or more exercises were not found." } as const;
  }

  const existingRoutine = await prisma.workoutTemplate.findFirst({
    where: {
      id: routineId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!existingRoutine) {
    return { error: "Routine not found." } as const;
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
      data: buildRoutineMetadata(payload),
    });
    await createRoutineChildren(tx, routineId, payload);
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
