import { prisma } from "@/lib/prisma";
import { recomputeUserPersonalRecords } from "@/lib/personal-records";
import type { ValidWorkoutMutation } from "@/lib/validation/workouts";
import {
  calculateWorkoutVolumeKg,
  getPersistedVolumeSetCompletion,
} from "@/lib/workout-volume";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  ExerciseListItem,
  ExerciseTrackingType,
  WorkoutDetail,
  WorkoutSummary,
} from "@/types/workout";

const workoutInclude = {
  user: {
    select: {
      bodyweightKg: true,
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
  supersets: {
    orderBy: {
      order: "asc" as const,
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

export function mapWorkoutDetail(workout: {
  id: number;
  title: string | null;
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
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
    hardRoundLimit: number | null;
  }>;
  user: {
    bodyweightKg: number | null;
  };
  exercises: Array<{
    id: number;
    notes: string | null;
    restSeconds: number | null;
    supersetId: string | null;
    supersetPosition: number | null;
    exercise: {
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
    };
    sets: Array<{
      id: number;
      reps: number | null;
      weight: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      steps: number | null;
      floors: number | null;
      rpe: number | null;
      notes: string | null;
      completed: boolean;
      supersetRoundIndex: number | null;
    }>;
  }>;
}): WorkoutDetail {
  const setCount = workout.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0
  );
  const totalVolume = calculateWorkoutVolumeKg({
    exercises: workout.exercises.map((workoutExercise) => ({
      trackingType: workoutExercise.exercise.trackingType,
      bodyweightLoadFactor: workoutExercise.exercise.bodyweightLoadFactor,
      sets: workoutExercise.sets.map((set) => ({
        reps: set.reps,
        weightKg: set.weight,
        completed: getPersistedVolumeSetCompletion({
          completed: set.completed,
          workoutUpdatedAt: workout.updatedAt,
        }),
      })),
    })),
    userBodyweightKg: workout.user.bodyweightKg,
  });

  return {
    id: workout.id,
    title: workout.title,
    notes: workout.notes,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    visibility: workout.visibility,
    createdAt: workout.createdAt.toISOString(),
    updatedAt: workout.updatedAt.toISOString(),
    supersets: workout.supersets.map((superset) => ({
      id: superset.id,
      key: superset.id,
      label: superset.label,
      colorKey: superset.colorKey,
      restSeconds: superset.restSeconds,
      plannedRounds: superset.plannedRounds,
      hardRoundLimit: superset.hardRoundLimit,
    })),
    setCount,
    totalVolume,
    exercises: workout.exercises.map((workoutExercise) => ({
      id: workoutExercise.id,
      notes: workoutExercise.notes,
      restSeconds: workoutExercise.restSeconds,
      supersetKey: workoutExercise.supersetId,
      supersetPosition: workoutExercise.supersetPosition,
      exercise: mapExercise(workoutExercise.exercise),
      sets: workoutExercise.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weight: set.weight,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        steps: set.steps,
        floors: set.floors,
        rpe: set.rpe,
        notes: set.notes,
        completed: set.completed,
        supersetRoundIndex: set.supersetRoundIndex,
      })),
    })),
  };
}

export function mapWorkoutSummary(workout: {
  id: number;
  title: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  visibility: "PRIVATE" | "PUBLIC";
  user?: {
    id: string;
    name: string | null;
    image: string | null;
    bodyweightKg?: number | null;
  };
  exercises: Array<{
    exercise: {
      trackingType: ExerciseTrackingType;
      bodyweightLoadFactor: number | null;
    };
    sets: Array<{
      reps: number | null;
      weight: number | null;
      durationSeconds?: number | null;
      completed?: boolean;
    }>;
  }>;
}): WorkoutSummary {
  const setCount = workout.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0
  );
  const totalVolume = calculateWorkoutVolumeKg({
    exercises: workout.exercises.map((workoutExercise) => ({
      trackingType: workoutExercise.exercise.trackingType,
      bodyweightLoadFactor: workoutExercise.exercise.bodyweightLoadFactor,
      sets: workoutExercise.sets.map((set) => ({
        reps: set.reps,
        weightKg: set.weight,
        completed: getPersistedVolumeSetCompletion({
          completed: set.completed ?? false,
          workoutUpdatedAt: workout.updatedAt,
        }),
      })),
    })),
    userBodyweightKg: workout.user?.bodyweightKg ?? null,
  });

  return {
    id: workout.id,
    title: workout.title,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    exerciseCount: workout.exercises.length,
    setCount,
    totalVolume,
    visibility: workout.visibility,
    user: workout.user
      ? {
          id: workout.user.id,
          name: workout.user.name,
          image: workout.user.image,
        }
      : undefined,
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

function buildWorkoutMetadata(payload: ValidWorkoutMutation) {
  return {
    title: payload.title,
    notes: payload.notes,
    startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
    completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
    visibility: payload.visibility,
  };
}

async function createWorkoutChildren(
  tx: Prisma.TransactionClient,
  workoutId: number,
  payload: ValidWorkoutMutation
) {
  if (payload.supersets.length > 0) {
    await tx.workoutSuperset.createMany({
      data: payload.supersets.map((superset, supersetIndex) => ({
        id: superset.key,
        workoutId,
        order: supersetIndex,
        label: superset.label,
        colorKey: superset.colorKey,
        restSeconds: superset.restSeconds,
        plannedRounds: superset.plannedRounds,
        hardRoundLimit: superset.hardRoundLimit,
      })),
    });
  }

  for (const [exerciseIndex, exercise] of payload.exercises.entries()) {
    await tx.workoutExercise.create({
      data: {
        workoutId,
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        notes: exercise.notes,
        restSeconds: exercise.restSeconds,
        supersetId: exercise.supersetKey,
        supersetPosition: exercise.supersetPosition,
        sets: {
          create: exercise.sets.map((set, setIndex) => ({
            order: setIndex,
            reps: set.reps,
            weight: set.weight,
            durationSeconds: set.durationSeconds,
            distanceMeters: set.distanceMeters,
            steps: set.steps,
            floors: set.floors,
            rpe: set.rpe,
            notes: set.notes,
            completed: set.completed,
            supersetRoundIndex: set.supersetRoundIndex,
          })),
        },
      },
    });
  }
}

export async function createUserWorkout(
  userId: string,
  payload: ValidWorkoutMutation
) {
  if (!(await assertExercisesExist(userId, payload.exercises.map((item) => item.exerciseId)))) {
    return null;
  }

  const workoutId = await prisma.$transaction(async (tx) => {
    const workout = await tx.workout.create({
      data: {
        userId,
        ...buildWorkoutMetadata(payload),
      },
      select: { id: true },
    });
    await createWorkoutChildren(tx, workout.id, payload);
    return workout.id;
  });
  const workout = await prisma.workout.findUniqueOrThrow({
    where: { id: workoutId },
    include: workoutInclude,
  });

  await recomputeUserPersonalRecords(userId);

  return mapWorkoutDetail(workout);
}

export async function updateUserWorkout(
  userId: string,
  workoutId: number,
  payload: ValidWorkoutMutation
) {
  if (!(await assertExercisesExist(userId, payload.exercises.map((item) => item.exerciseId)))) {
    return null;
  }

  const existingWorkout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!existingWorkout) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workoutExercise.deleteMany({
      where: {
        workoutId,
      },
    });
    await tx.workoutSuperset.deleteMany({
      where: {
        workoutId,
      },
    });

    await tx.workout.update({
      where: {
        id: workoutId,
      },
      data: buildWorkoutMetadata(payload),
    });
    await createWorkoutChildren(tx, workoutId, payload);
  });

  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId,
    },
    include: workoutInclude,
  });

  await recomputeUserPersonalRecords(userId);

  return workout ? mapWorkoutDetail(workout) : null;
}

export const userWorkoutInclude = workoutInclude;
