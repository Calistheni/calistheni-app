import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WorkoutBuilder } from "@/components/workouts/WorkoutBuilder";
import { parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { routineInclude } from "@/lib/routines";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import type { WorkoutDetail } from "@/types/workout";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import { sanitizeRoutineSetForTrackingType } from "@/lib/exercise-tracking-fields";

export const metadata: Metadata = {
  title: "New Workout",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      where: exerciseVisibilityWhere(session.user.id),
      orderBy: [{ muscle: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        muscle: true,
        secondaryMuscles: true,
        thumbnailUrl: true,
        videoUrl: true,
        trackingType: true,
        bodyweightLoadFactor: true,
        createdByUserId: true,
      },
    }),
    prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        bodyweightKg: true,
        rpeTrackingEnabled: true,
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
  const routineSupersetKeyMap = new Map(
    routine?.supersets.map((superset) => [
      superset.id,
      `superset-${crypto.randomUUID()}`,
    ]) ?? []
  );
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
        supersets: routine.supersets.map((superset) => ({
          id: routineSupersetKeyMap.get(superset.id) ?? superset.id,
          key: routineSupersetKeyMap.get(superset.id) ?? superset.id,
          label: superset.label,
          colorKey: superset.colorKey,
          restSeconds: superset.restSeconds,
          plannedRounds: superset.plannedRounds,
        })),
        exercises: routine.exercises.map((routineExercise) => ({
          id: -routineExercise.id,
          notes: routineExercise.notes,
          restSeconds: routineExercise.restSeconds,
          supersetKey: routineExercise.supersetId
            ? (routineSupersetKeyMap.get(routineExercise.supersetId) ?? null)
            : null,
          supersetPosition: routineExercise.supersetPosition,
          exercise: mapExercise(routineExercise.exercise),
          sets: routineExercise.sets.map((set) => {
            const normalizedSet = sanitizeRoutineSetForTrackingType(
              {
                reps: set.reps,
                weightKg: set.weightKg,
                durationSec: set.durationSec,
                distanceMeters: set.distanceMeters,
                steps: set.steps,
                floors: set.floors,
              },
              routineExercise.exercise.trackingType
            );

            return {
              id: -set.id,
              reps: normalizedSet.reps,
              weight: normalizedSet.weightKg,
              durationSeconds: normalizedSet.durationSec,
              distanceMeters: normalizedSet.distanceMeters,
              steps: normalizedSet.steps,
              floors: normalizedSet.floors,
              rpe: null,
              notes: null,
              completed: false,
              supersetRoundIndex: null,
            };
          }),
        })),
      }
    : undefined;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-4 pt-0 sm:p-6 lg:p-8">
      <WorkoutBuilder
        exercises={exercises.map(mapExercise)}
        initialWorkout={initialWorkoutFromRoutine}
        saveMode="create"
        userBodyweightKg={user?.bodyweightKg ?? null}
        rpeTrackingEnabled={user?.rpeTrackingEnabled ?? false}
      />
    </main>
  );
}
