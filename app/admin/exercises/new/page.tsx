import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExerciseForm } from "@/components/exercises/ExerciseForm";
import { BackButton } from "@/components/navigation/BackButton";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Add Global Exercise",
  robots: { index: false, follow: false },
};

export default async function NewAdminExercisePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const muscles = await prisma.exercise.findMany({
    where: { createdByUserId: null },
    distinct: ["muscle"],
    orderBy: { muscle: "asc" },
    select: { muscle: true },
  });

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/admin/exercises" />
      <ExerciseForm
        mode="admin-create"
        muscleOptions={muscles.map((exercise) => exercise.muscle)}
      />
    </main>
  );
}
