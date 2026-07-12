import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  ExerciseProgressChart,
  type ExerciseProgressChartPoint,
} from "@/components/exercises/ExerciseProgressChart";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { calculateSetVolumeKg } from "@/lib/workout-volume";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";

export const metadata: Metadata = {
  title: "Exercise Progress",
  robots: {
    index: false,
    follow: false,
  },
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  return remainingSeconds === 0
    ? `${minutes} min`
    : `${minutes}m ${remainingSeconds}s`;
}

function formatKg(value: number | null) {
  return value === null ? "Unavailable" : `${Math.round(value).toLocaleString()} kg`;
}

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const exercise = await prisma.exercise.findFirst({
    where: {
      AND: [exerciseVisibilityWhere(session.user.id)],
      OR: [{ id }, { slug: id }],
    },
  });

  if (!exercise) {
    notFound();
  }

  const [user, workoutExercises] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        bodyweightKg: true,
      },
    }),
    prisma.workoutExercise.findMany({
      where: {
        exerciseId: exercise.id,
        workout: {
          userId: session.user.id,
        },
        sets: {
          some: {
            completed: true,
          },
        },
      },
      orderBy: {
        workout: {
          startedAt: "asc",
        },
      },
      include: {
        workout: {
          select: {
            id: true,
            title: true,
            startedAt: true,
          },
        },
        sets: {
          where: {
            completed: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    }),
  ]);

  let bestSetVolume: number | null = null;
  let bestReps = 0;
  let bestWeight = 0;
  let longestDuration = 0;
  let totalSets = 0;
  let totalReps = 0;
  let totalDuration = 0;
  let lifetimeVolume = 0;
  let hasUnavailableVolume = false;
  const sessionIds = new Set<number>();
  const chartData: ExerciseProgressChartPoint[] = [];

  for (const workoutExercise of workoutExercises) {
    sessionIds.add(workoutExercise.workout.id);
    let workoutVolume = 0;
    let workoutVolumeAvailable = true;
    let workoutBestSet = 0;
    let workoutReps = 0;
    let workoutDuration = 0;
    let workoutBestWeight = 0;

    for (const set of workoutExercise.sets) {
      totalSets += 1;
      totalReps += set.reps ?? 0;
      workoutReps += set.reps ?? 0;
      bestReps = Math.max(bestReps, set.reps ?? 0);
      bestWeight = Math.max(bestWeight, set.weight ?? 0);
      workoutBestWeight = Math.max(workoutBestWeight, set.weight ?? 0);
      longestDuration = Math.max(longestDuration, set.durationSeconds ?? 0);
      totalDuration += set.durationSeconds ?? 0;
      workoutDuration += set.durationSeconds ?? 0;

      const setVolume = calculateSetVolumeKg({
        trackingType: exercise.trackingType,
        reps: set.reps,
        weightKg: set.weight,
        userBodyweightKg: user?.bodyweightKg ?? null,
        bodyweightLoadFactor: exercise.bodyweightLoadFactor,
      });

      if (setVolume === null) {
        hasUnavailableVolume = true;
        workoutVolumeAvailable = false;
      } else {
        workoutVolume += setVolume;
        lifetimeVolume += setVolume;
        workoutBestSet = Math.max(workoutBestSet, setVolume);
        bestSetVolume =
          bestSetVolume === null ? setVolume : Math.max(bestSetVolume, setVolume);
      }
    }

    chartData.push({
      date: workoutExercise.workout.startedAt.toISOString(),
      label: workoutExercise.workout.startedAt.toLocaleDateString(),
      volume: workoutVolumeAvailable ? workoutVolume : 0,
      bestSet: workoutBestSet,
      reps: workoutReps,
      duration: workoutDuration,
      weight: workoutBestWeight,
    });
  }

  const isDurationExercise =
    exercise.trackingType === "DURATION" ||
    exercise.trackingType === "DISTANCE_DURATION" ||
    exercise.trackingType === "STEPS_DISTANCE_DURATION" ||
    exercise.trackingType === "FLOORS_DISTANCE_DURATION" ||
    exercise.trackingType === "WEIGHT_DISTANCE_DURATION";
  const enabledMetrics = [
    ...(hasUnavailableVolume ? [] : (["volume", "bestSet"] as const)),
    ...(!isDurationExercise ? (["reps"] as const) : []),
    ...(isDurationExercise ? (["duration"] as const) : []),
    ...(bestWeight > 0 ? (["weight"] as const) : []),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref={`/exercises/${exercise.id}`} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{exercise.name} Progress</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{exercise.muscle}</Badge>
            <Badge variant="outline">{exercise.trackingType}</Badge>
          </div>
        </div>
        <Button asChild>
          <Link href="/workouts/new">Log Workout</Link>
        </Button>
      </div>

      {workoutExercises.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              Log this exercise in a workout to see progress.
            </p>
            <Button asChild>
              <Link href="/workouts/new">Start Workout</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Best set</p>
                <p className="text-2xl font-bold">
                  {isDurationExercise
                    ? formatDuration(longestDuration)
                    : formatKg(bestSetVolume)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Best reps</p>
                <p className="text-2xl font-bold">{bestReps}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {exercise.trackingType === "WEIGHTED_BODYWEIGHT"
                    ? "Best added weight"
                    : "Best weight"}
                </p>
                <p className="text-2xl font-bold">
                  {bestWeight.toLocaleString()} kg
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Best volume</p>
                <p className="text-2xl font-bold">{formatKg(bestSetVolume)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total sessions</p>
                <p className="text-2xl font-bold">{sessionIds.size}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total sets</p>
                <p className="text-2xl font-bold">{totalSets}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {isDurationExercise ? "Total duration" : "Total reps"}
                </p>
                <p className="text-2xl font-bold">
                  {isDurationExercise
                    ? formatDuration(totalDuration)
                    : totalReps.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  Lifetime volume
                </p>
                <p className="text-2xl font-bold">
                  {hasUnavailableVolume
                    ? "Partial"
                    : formatKg(lifetimeVolume)}
                </p>
              </CardContent>
            </Card>
          </div>

          <ExerciseProgressChart
            data={chartData}
            enabledMetrics={[...enabledMetrics]}
          />

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">
                Recent Workouts Containing This Exercise
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...workoutExercises].reverse().slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  href={`/workouts/${item.workout.id}`}
                  className="block rounded-xl border p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {item.workout.title ?? "Workout"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.workout.startedAt.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {item.sets.length} completed set
                      {item.sets.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
