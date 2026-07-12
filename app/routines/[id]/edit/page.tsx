import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { RoutineBuilder } from "@/components/routines/RoutineBuilder";
import { parsePositiveInteger } from "@/lib/api-response";
import { mapRoutineDetail, routineInclude } from "@/lib/routines";
import { prisma } from "@/lib/prisma";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";

export const metadata: Metadata = {
  title: "Edit Routine",
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
  return exercise;
}

export default async function EditRoutinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const routineId = parsePositiveInteger(id);

  if (routineId === null) {
    notFound();
  }

  const [routine, exercises] = await Promise.all([
    prisma.workoutTemplate.findFirst({
      where: {
        id: routineId,
        userId: session.user.id,
      },
      include: routineInclude,
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
  ]);

  if (!routine) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref={`/routines/${routine.id}`} />
      <RoutineBuilder
        exercises={exercises.map(mapExercise)}
        initialRoutine={mapRoutineDetail(routine)}
      />
    </main>
  );
}
