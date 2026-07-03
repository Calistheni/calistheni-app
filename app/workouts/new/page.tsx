import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WorkoutBuilder } from "@/components/workouts/WorkoutBuilder";
import { prisma } from "@/lib/prisma";
import type { ExerciseListItem } from "@/types/workout";

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

export default async function NewWorkoutPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const exercises = await prisma.exercise.findMany({
    orderBy: [{ muscle: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      muscle: true,
      thumbnailUrl: true,
      videoUrl: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <WorkoutBuilder exercises={exercises.map(mapExercise)} />
    </main>
  );
}
