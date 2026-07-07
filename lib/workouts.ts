import { prisma } from "@/lib/prisma";
import type { ValidWorkoutMutation } from "@/lib/validation/workouts";
import { calculateWorkoutVolumeKg } from "@/lib/workout-volume";
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

export function mapWorkoutDetail(workout: {
  id: number;
  title: string | null;
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: Date;
  updatedAt: Date;
  user: {
    bodyweightKg: number | null;
  };
  exercises: Array<{
    id: number;
    notes: string | null;
    restSeconds: number | null;
    exercise: {
      id: string;
      slug: string;
      name: string;
      muscle: string;
      thumbnailUrl: string | null;
      videoUrl: string | null;
      trackingType: ExerciseTrackingType;
      bodyweightLoadFactor: number | null;
    };
    sets: Array<{
      id: number;
      reps: number | null;
      weight: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      steps: number | null;
      floors: number | null;
      notes: string | null;
      completed: boolean;
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
    setCount,
    totalVolume,
    exercises: workout.exercises.map((workoutExercise) => ({
      id: workoutExercise.id,
      notes: workoutExercise.notes,
      restSeconds: workoutExercise.restSeconds,
      exercise: mapExercise(workoutExercise.exercise),
      sets: workoutExercise.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weight: set.weight,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        steps: set.steps,
        floors: set.floors,
        notes: set.notes,
        completed: set.completed,
      })),
    })),
  };
}

export function mapWorkoutSummary(workout: {
  id: number;
  title: string | null;
  startedAt: Date;
  completedAt: Date | null;
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
    visibility: payload.visibility,
    exercises: {
      create: payload.exercises.map((exercise, exerciseIndex) => ({
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        notes: exercise.notes,
        restSeconds: exercise.restSeconds,
        sets: {
          create: exercise.sets.map((set, setIndex) => ({
            order: setIndex,
            reps: set.reps,
            weight: set.weight,
            durationSeconds: set.durationSeconds,
            distanceMeters: set.distanceMeters,
            steps: set.steps,
            floors: set.floors,
            notes: set.notes,
            completed: set.completed,
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
