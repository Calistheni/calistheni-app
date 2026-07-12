import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExerciseForm } from "@/components/exercises/ExerciseForm";
import { BackButton } from "@/components/navigation/BackButton";
import type { CreatableExerciseTrackingType } from "@/lib/exercises";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Edit Custom Exercise",
  robots: { index: false, follow: false },
};

export default async function EditCustomExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const [exercise, muscles] = await Promise.all([
    prisma.exercise.findFirst({
      where: { id, createdByUserId: session.user.id },
    }),
    prisma.exercise.findMany({
      where: { createdByUserId: null },
      distinct: ["muscle"],
      orderBy: { muscle: "asc" },
      select: { muscle: true },
    }),
  ]);
  if (!exercise) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/exercises" />
      <ExerciseForm
        mode="custom-edit"
        exerciseId={exercise.id}
        muscleOptions={muscles.map((item) => item.muscle)}
        initialValues={{
          name: exercise.name,
          muscle: exercise.muscle,
          secondaryMuscles: exercise.secondaryMuscles,
          trackingType:
            exercise.trackingType as CreatableExerciseTrackingType,
          bodyweightLoadFactor: exercise.bodyweightLoadFactor,
        }}
      />
    </main>
  );
}
