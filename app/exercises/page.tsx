import type { Metadata } from "next";
import { ExerciseGrid } from "@/components/exercises/ExerciseGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import type { ExerciseListItem } from "@/types/workout";

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

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; muscle?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const muscle = (params.muscle ?? "").trim();

  const [exercises, muscles] = await Promise.all([
    prisma.exercise.findMany({
      where: {
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
      },
    }),
    prisma.exercise.findMany({
      distinct: ["muscle"],
      orderBy: {
        muscle: "asc",
      },
      select: {
        muscle: true,
      },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 space-y-3">
        <h1 className="text-3xl font-bold">Exercises</h1>
        <p className="text-sm text-muted-foreground">
          Search the exercise library and preview movement media from R2.
        </p>
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
      </div>

      <ExerciseGrid exercises={exercises.map(mapExercise)} />
    </main>
  );
}
