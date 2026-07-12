import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { RoutineBuilder } from "@/components/routines/RoutineBuilder";
import { prisma } from "@/lib/prisma";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";

export const metadata: Metadata = {
  title: "New Routine",
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
  secondaryMuscles: string[];
  thumbnailUrl: string | null;
  videoUrl: string | null;
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
  createdByUserId: string | null;
}): ExerciseListItem {
  return exercise;
}

export default async function NewRoutinePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const exercises = await prisma.exercise.findMany({
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
  });

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/routines" />
      <RoutineBuilder exercises={exercises.map(mapExercise)} />
    </main>
  );
}
