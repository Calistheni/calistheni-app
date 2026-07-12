import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExerciseForm } from "@/components/exercises/ExerciseForm";
import { BackButton } from "@/components/navigation/BackButton";

export const metadata: Metadata = {
  title: "Create Custom Exercise",
  robots: { index: false, follow: false },
};

export default async function NewCustomExercisePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/exercises" />
      <ExerciseForm mode="custom-create" />
    </main>
  );
}
