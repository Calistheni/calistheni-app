import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { auth } from "@/auth";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Exercise Records",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LegacyExerciseProgressPage({
  params,
}: PageProps<"/exercises/[id]/progress">) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const exercise = await prisma.exercise.findFirst({
    where: {
      AND: [
        exerciseVisibilityWhere(session.user.id),
        { OR: [{ id }, { slug: id }] },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!exercise) {
    notFound();
  }

  permanentRedirect(
    `/profile/records/${encodeURIComponent(exercise.id)}`
  );
}
