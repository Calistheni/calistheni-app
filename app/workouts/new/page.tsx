import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { WorkoutBuilder } from "@/components/workouts/WorkoutBuilder";
import { parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { routineInclude } from "@/lib/routines";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import type { WorkoutDetail } from "@/types/workout";

export const metadata: Metadata = {
  title: "New Workout",
  robots: {
    index: false,
    follow: false,
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

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ routineId?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const routineId = params.routineId
    ? parsePositiveInteger(params.routineId)
    : null;
  const [exercises, user, routine] = await Promise.all([
    prisma.exercise.findMany({
      orderBy: [{ muscle: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        muscle: true,
        thumbnailUrl: true,
        videoUrl: true,
        trackingType: true,
        bodyweightLoadFactor: true,
      },
    }),
    prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        bodyweightKg: true,
      },
    }),
    routineId
      ? prisma.workoutTemplate.findFirst({
          where: {
            id: routineId,
            userId: session.user.id,
          },
          include: routineInclude,
        })
      : null,
  ]);
  const initialWorkoutFromRoutine: WorkoutDetail | undefined = routine
    ? {
        id: 0,
        title: routine.name,
        notes: routine.description,
        startedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        visibility: "PUBLIC",
        setCount: routine.exercises.reduce(
          (count, exercise) => count + exercise.sets.length,
          0
        ),
        totalVolume: null,
        exercises: routine.exercises.map((routineExercise) => ({
          id: -routineExercise.id,
          notes: routineExercise.notes,
          restSeconds: routineExercise.restSeconds,
          exercise: mapExercise(routineExercise.exercise),
          sets: routineExercise.sets.map((set) => ({
            id: -set.id,
            reps: set.reps,
            weight: set.weightKg,
            durationSeconds: set.durationSec,
            distanceMeters: null,
            steps: null,
            floors: null,
            notes: null,
            completed: false,
          })),
        })),
      }
    : undefined;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/workouts" />
      <WorkoutBuilder
        exercises={exercises.map(mapExercise)}
        initialWorkout={initialWorkoutFromRoutine}
        saveMode="create"
        userBodyweightKg={user?.bodyweightKg ?? null}
      />
    </main>
  );
}
