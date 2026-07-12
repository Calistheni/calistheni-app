import type { Metadata } from "next";
import Link from "next/link";
import { ExerciseGrid } from "@/components/exercises/ExerciseGrid";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import { auth } from "@/auth";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import { FREE_CUSTOM_EXERCISE_LIMIT } from "@/lib/custom-exercise-entitlements";

export const metadata: Metadata = {
  title: "Exercises",
  description: "Browse calisthenics and strength exercises for workouts.",
  alternates: {
    canonical: "/exercises",
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

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; muscle?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const q = (params.q ?? "").trim();
  const muscle = (params.muscle ?? "").trim();

  const [exercises, muscles, customExerciseCount] = await Promise.all([
    prisma.exercise.findMany({
      where: {
        AND: [exerciseVisibilityWhere(userId)],
        ...(q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  muscle: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
        ...(muscle ? { muscle } : {}),
      },
      orderBy: [{ muscle: "asc" }, { name: "asc" }],
      take: 120,
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
    prisma.exercise.findMany({
      where: exerciseVisibilityWhere(userId),
      distinct: ["muscle"],
      orderBy: {
        muscle: "asc",
      },
      select: {
        muscle: true,
      },
    }),
    userId
      ? prisma.exercise.count({ where: { createdByUserId: userId } })
      : Promise.resolve(0),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Exercises</h1>
          <p className="text-sm text-muted-foreground">
            Search the exercise library and preview movement media from R2.
          </p>
        </div>
        {userId ? (
          <Button asChild>
            <Link href="/exercises/custom/new">Create Custom Exercise</Link>
          </Button>
        ) : null}
      </div>

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="sr-only" htmlFor="exercise-search">
          Search exercises
        </label>
        <Input
          id="exercise-search"
          name="q"
          defaultValue={q}
          placeholder="Search exercises or muscles"
        />
        {muscle ? <input type="hidden" name="muscle" value={muscle} /> : null}
        <Button type="submit">Search</Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild variant={muscle ? "outline" : "secondary"} size="sm">
          <a href={q ? `/exercises?q=${encodeURIComponent(q)}` : "/exercises"}>
            All
          </a>
        </Button>
        {muscles.map((item) => {
          const href = `/exercises?${new URLSearchParams({
            ...(q ? { q } : {}),
            muscle: item.muscle,
          })}`;

          return (
            <Button
              key={item.muscle}
              asChild
              variant={muscle === item.muscle ? "secondary" : "outline"}
              size="sm"
            >
              <a href={href}>{item.muscle}</a>
            </Button>
          );
        })}
      </div>

      <div className="mb-4">
        <Badge variant="outline">
          {exercises.length.toLocaleString()} exercise
          {exercises.length === 1 ? "" : "s"}
        </Badge>
        {userId ? (
          <Badge variant="outline" className="ml-2">
            {customExerciseCount}/{FREE_CUSTOM_EXERCISE_LIMIT} custom
          </Badge>
        ) : null}
      </div>

      <ExerciseGrid
        exercises={exercises.map(mapExercise)}
        currentUserId={userId}
      />
    </main>
  );
}
