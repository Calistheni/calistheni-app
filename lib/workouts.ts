import { prisma } from "@/lib/prisma";
import type { ValidWorkoutMutation } from "@/lib/validation/workouts";
import type { ExerciseListItem, WorkoutDetail, WorkoutSummary } from "@/types/workout";

const workoutInclude = {
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
}): ExerciseListItem {
  return {
    id: exercise.id,
    slug: exercise.slug,
    name: exercise.name,
    muscle: exercise.muscle,
    thumbnailUrl: exercise.thumbnailUrl,
    videoUrl: exercise.videoUrl,
  };
}

export function mapWorkoutDetail(workout: {
  id: number;
  title: string | null;
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  exercises: Array<{
    id: number;
    notes: string | null;
    exercise: {
      id: string;
      slug: string;
      name: string;
      muscle: string;
      thumbnailUrl: string | null;
      videoUrl: string | null;
    };
    sets: Array<{
      id: number;
      reps: number | null;
      weight: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      notes: string | null;
    }>;
  }>;
}): WorkoutDetail {
  return {
    id: workout.id,
    title: workout.title,
    notes: workout.notes,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    createdAt: workout.createdAt.toISOString(),
    updatedAt: workout.updatedAt.toISOString(),
    exercises: workout.exercises.map((workoutExercise) => ({
      id: workoutExercise.id,
      notes: workoutExercise.notes,
      exercise: mapExercise(workoutExercise.exercise),
      sets: workoutExercise.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weight: set.weight,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        notes: set.notes,
      })),
    })),
  };
}

export function mapWorkoutSummary(workout: {
  id: number;
  title: string | null;
  startedAt: Date;
  completedAt: Date | null;
  exercises: Array<{
    sets: unknown[];
  }>;
}): WorkoutSummary {
  return {
    id: workout.id,
    title: workout.title,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    exerciseCount: workout.exercises.length,
    setCount: workout.exercises.reduce(
      (count, exercise) => count + exercise.sets.length,
      0
    ),
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

function buildWorkoutData(payload: ValidWorkoutMutation) {
  return {
    title: payload.title,
    notes: payload.notes,
    startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
    completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
    exercises: {
      create: payload.exercises.map((exercise, exerciseIndex) => ({
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        notes: exercise.notes,
        sets: {
          create: exercise.sets.map((set, setIndex) => ({
            order: setIndex,
            reps: set.reps,
            weight: set.weight,
            durationSeconds: set.durationSeconds,
            distanceMeters: set.distanceMeters,
            notes: set.notes,
          })),
        },
      })),
    },
  };
}

export async function createUserWorkout(
  userId: string,
  payload: ValidWorkoutMutation
) {
  if (!(await assertExercisesExist(payload.exercises.map((item) => item.exerciseId)))) {
    return null;
  }

  const workout = await prisma.workout.create({
    data: {
      userId,
      ...buildWorkoutData(payload),
    },
    include: workoutInclude,
  });

  return mapWorkoutDetail(workout);
}

export async function updateUserWorkout(
  userId: string,
  workoutId: number,
  payload: ValidWorkoutMutation
) {
  if (!(await assertExercisesExist(payload.exercises.map((item) => item.exerciseId)))) {
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

    await tx.workout.update({
      where: {
        id: workoutId,
      },
      data: buildWorkoutData(payload),
    });
  });

  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId,
    },
    include: workoutInclude,
  });

  return workout ? mapWorkoutDetail(workout) : null;
}

export const userWorkoutInclude = workoutInclude;
