import { prisma } from "@/lib/prisma";
import type { ValidRoutineMutation } from "@/lib/validation/routines";
import type { RoutineDetail } from "@/types/routine";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";

export const FREE_ROUTINE_LIMIT = 4;

export const routineInclude = {
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
  thumbnailUrl: string | null;
  videoUrl: string | null;
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
}): ExerciseListItem {
  return {
    id: exercise.id,
    slug: exercise.slug,
    name: exercise.name,
    muscle: exercise.muscle,
    thumbnailUrl: exercise.thumbnailUrl,
    videoUrl: exercise.videoUrl,
    trackingType: exercise.trackingType,
    bodyweightLoadFactor: exercise.bodyweightLoadFactor,
  };
}

export function mapRoutineDetail(template: {
  id: number;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: Date;
  updatedAt: Date;
  exercises: Array<{
    id: number;
    restSeconds: number | null;
    notes: string | null;
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
    exercises: template.exercises.map((templateExercise) => ({
      id: templateExercise.id,
      restSeconds: templateExercise.restSeconds,
      notes: templateExercise.notes,
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

async function assertExercisesExist(exerciseIds: string[]) {
  const uniqueExerciseIds = [...new Set(exerciseIds)];
  const existingCount = await prisma.exercise.count({
    where: {
      id: {
        in: uniqueExerciseIds,
      },
    },
  });

  return existingCount === uniqueExerciseIds.length;
}

function buildRoutineData(payload: ValidRoutineMutation) {
  return {
    name: payload.name,
    description: payload.description,
    visibility: payload.visibility,
    exercises: {
      create: payload.exercises.map((exercise, exerciseIndex) => ({
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes,
        sets: {
          create: exercise.sets.map((set, setIndex) => ({
            order: setIndex,
            reps: set.reps,
            weightKg: set.weightKg,
            durationSec: set.durationSec,
          })),
        },
      })),
    },
  };
}

export async function createUserRoutine(
  userId: string,
  payload: ValidRoutineMutation
) {
  if (!(await assertExercisesExist(payload.exercises.map((item) => item.exerciseId)))) {
    return { error: "One or more exercises were not found." } as const;
  }

  const routineCount = await prisma.workoutTemplate.count({
    where: {
      userId,
    },
  });

  if (routineCount >= FREE_ROUTINE_LIMIT) {
    return { error: "Upgrade to Pro for unlimited routines." } as const;
  }

  const routine = await prisma.workoutTemplate.create({
    data: {
      userId,
      ...buildRoutineData(payload),
    },
    include: routineInclude,
  });

  return { routine: mapRoutineDetail(routine) } as const;
}

export async function updateUserRoutine(
  userId: string,
  routineId: number,
  payload: ValidRoutineMutation
) {
  if (!(await assertExercisesExist(payload.exercises.map((item) => item.exerciseId)))) {
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

    await tx.workoutTemplate.update({
      where: {
        id: routineId,
      },
      data: buildRoutineData(payload),
    });
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
