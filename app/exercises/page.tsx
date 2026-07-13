import type { Metadata } from "next";
import Link from "next/link";
import { ExerciseGrid } from "@/components/exercises/ExerciseGrid";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import type { ExerciseListItem, ExerciseTrackingType } from "@/types/workout";
import { auth } from "@/auth";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import {
  FREE_CUSTOM_EXERCISE_LIMIT,
  getUserEntitlements,
} from "@/lib/entitlements";

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
  secondaryMuscles: string[];
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
    secondaryMuscles: exercise.secondaryMuscles,
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
  searchParams: Promise<{
    q?: string;
    muscle?: string;
    library?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const q = (params.q ?? "").trim();
  const muscle = (params.muscle ?? "").trim();
  const library =
    userId && (params.library === "custom" || params.library === "global")
      ? params.library
      : "all";
  const libraryWhere =
    library === "custom"
      ? { createdByUserId: userId! }
      : library === "global"
      ? { createdByUserId: null }
      : exerciseVisibilityWhere(userId);

  const [exercises, muscles, customExerciseCount, entitlementResult] = await Promise.all([
    prisma.exercise.findMany({
      where: {
        AND: [libraryWhere],
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
        secondaryMuscles: true,
        thumbnailUrl: true,
        videoUrl: true,
        trackingType: true,
        bodyweightLoadFactor: true,
        createdByUserId: true,
      },
    }),
    prisma.exercise.findMany({
      where: libraryWhere,
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
    userId ? getUserEntitlements(userId) : Promise.resolve(null),
  ]);
  const isPro = entitlementResult?.entitlements.isPro ?? false;
  const atCustomExerciseLimit =
    !isPro && customExerciseCount >= FREE_CUSTOM_EXERCISE_LIMIT;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Exercises</h1>
          <p className="text-sm text-muted-foreground">
            {/* Search the exercise library and preview movement media from R2. */}
          </p>
        </div>
        {userId && !atCustomExerciseLimit ? (
          <Button asChild>
            <Link href="/exercises/custom/new">Create Custom Exercise</Link>
          </Button>
        ) : userId ? (
          <Button asChild>
            <Link href="/pro">Upgrade to Pro</Link>
          </Button>
        ) : null}
      </div>

      <form
        className={`mb-6 grid gap-3 rounded-xl border bg-card p-4 ${
          userId
            ? "sm:grid-cols-[minmax(0,1fr)_220px_auto]"
            : "sm:grid-cols-[minmax(0,1fr)_auto]"
        }`}
      >
        <label className="sr-only" htmlFor="exercise-search">
          Search exercises
        </label>
        <Input
          id="exercise-search"
          name="q"
          defaultValue={q}
          placeholder="Search exercises or muscles"
        />
        {userId ? (
          <div>
            <label className="sr-only" htmlFor="exercise-library">
              Exercise library
            </label>
            <Select name="library" defaultValue={library}>
              <SelectTrigger id="exercise-library" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exercises</SelectItem>
                <SelectItem value="global">Global exercises</SelectItem>
                <SelectItem value="custom">My custom exercises</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {muscle ? <input type="hidden" name="muscle" value={muscle} /> : null}
        <Button type="submit">Search</Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild variant={muscle ? "outline" : "secondary"} size="sm">
          <Link
            href={`/exercises?${new URLSearchParams({
              ...(q ? { q } : {}),
              ...(library !== "all" ? { library } : {}),
            })}`}
          >
            All
          </Link>
        </Button>
        {muscles.map((item) => {
          const href = `/exercises?${new URLSearchParams({
            ...(q ? { q } : {}),
            muscle: item.muscle,
            ...(library !== "all" ? { library } : {}),
          })}`;

          return (
            <Button
              key={item.muscle}
              asChild
              variant={muscle === item.muscle ? "secondary" : "outline"}
              size="sm"
            >
              <Link href={href}>{item.muscle}</Link>
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
            {isPro
              ? `${customExerciseCount} custom · unlimited`
              : `${customExerciseCount}/${FREE_CUSTOM_EXERCISE_LIMIT} custom`}
          </Badge>
        ) : null}
      </div>

      {atCustomExerciseLimit ? (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Free accounts can create up to {FREE_CUSTOM_EXERCISE_LIMIT} custom
            exercises. {" "}
            <Link href="/pro" className="font-medium text-primary underline">
              Upgrade to Pro
            </Link>{" "}
            for unlimited custom exercises.
          </CardContent>
        </Card>
      ) : null}

      <ExerciseGrid
        exercises={exercises.map(mapExercise)}
        currentUserId={userId}
        customOnly={library === "custom"}
      />
    </main>
  );
}
