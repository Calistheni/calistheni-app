import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { WorkoutBuilder } from "@/components/workouts/WorkoutBuilder";
import { parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { mapWorkoutDetail, userWorkoutInclude } from "@/lib/workouts";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";

export const metadata: Metadata = {
  title: "Edit Workout",
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
  createdByUserId: string | null;
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
    createdByUserId: exercise.createdByUserId,
  };
}

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const workoutId = parsePositiveInteger(id);

  if (workoutId === null) {
    notFound();
  }

  const [workout, exercises, user] = await Promise.all([
    prisma.workout.findFirst({
      where: {
        id: workoutId,
        userId: session.user.id,
      },
      include: userWorkoutInclude,
    }),
    prisma.exercise.findMany({
      where: exerciseVisibilityWhere(session.user.id),
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
  ]);

  if (!workout) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/workouts" />
      <WorkoutBuilder
        exercises={exercises.map(mapExercise)}
        initialWorkout={mapWorkoutDetail(workout)}
        userBodyweightKg={user?.bodyweightKg ?? null}
        rpeTrackingEnabled={user?.rpeTrackingEnabled ?? false}
      />
    </main>
  );
}
