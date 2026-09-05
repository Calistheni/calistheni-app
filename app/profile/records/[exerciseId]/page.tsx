import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExerciseProgressChart } from "@/components/exercises/ExerciseProgressChart";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import { getExerciseRecordHref } from "@/lib/exercise-routes";
import {
  formatExerciseRecordMetricValue,
  getExerciseMetricDefinitions,
  getExercisePersonalRecords,
  getExerciseRecordHistory,
  getExerciseWorkoutMetrics,
} from "@/lib/exercise-record-metrics";
import {
  getExerciseThumbnailSrc,
  getExerciseTrackingTypeLabel,
} from "@/lib/exercise-display";
import { prisma } from "@/lib/prisma";
import { calculateSetVolumeKg } from "@/lib/workout-volume";
import { LocalWorkoutDateTime } from "@/components/workouts/LocalWorkoutDateTime";

export const metadata: Metadata = {
  title: "Exercise Records",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ExerciseRecordsPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { exerciseId } = await params;
  const exercise = await prisma.exercise.findFirst({
    where: {
      AND: [
        exerciseVisibilityWhere(session.user.id),
        { OR: [{ id: exerciseId }, { slug: exerciseId }] },
      ],
    },
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
  });

  if (!exercise) {
    notFound();
  }
  if (exerciseId !== exercise.slug) {
    permanentRedirect(getExerciseRecordHref(exercise.slug));
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
      orderBy: [
        {
          workout: {
            startedAt: "asc",
          },
        },
        { id: "asc" },
      ],
      select: {
        id: true,
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
          select: {
            reps: true,
            weight: true,
            durationSeconds: true,
            distanceMeters: true,
            steps: true,
            floors: true,
          },
        },
      },
    }),
  ]);

  const performances = getExerciseWorkoutMetrics({
    trackingType: exercise.trackingType,
    bodyweightLoadFactor: exercise.bodyweightLoadFactor,
    userBodyweightKg: user?.bodyweightKg ?? null,
    calculateSetVolume: calculateSetVolumeKg,
    occurrences: workoutExercises.map((workoutExercise) => ({
      workoutExerciseId: workoutExercise.id,
      workoutId: workoutExercise.workout.id,
      workoutTitle: workoutExercise.workout.title,
      startedAt: workoutExercise.workout.startedAt,
      sets: workoutExercise.sets,
    })),
  });
  const metrics = getExerciseMetricDefinitions(
    exercise.trackingType,
    performances
  );
  const records = getExercisePersonalRecords(performances, metrics);
  const recordHistory = getExerciseRecordHistory(performances, metrics);
  const chartMetrics = records.map((record) => ({
    ...record.metric,
    bestValue: record.value,
  }));
  const firstPerformance = performances[0];
  const lastPerformance = performances.at(-1);
  const recentPerformances = performances.slice(-10).reverse();
  const recentMetricKeys = new Set(
    metrics.slice(0, 4).map((metric) => metric.key)
  );

  return (
    <main className="mx-auto w-full max-w-6xl p-4 pb-24 sm:p-6 sm:pb-8 lg:p-8">
      <BackButton fallbackHref="/profile/records" />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-6">
          <Image
            src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
            alt=""
            width={192}
            height={192}
            unoptimized
            className="size-24 rounded-xl bg-muted object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{exercise.muscle}</Badge>
              <Badge variant="outline">
                {getExerciseTrackingTypeLabel(exercise.trackingType)}
              </Badge>
              {exercise.createdByUserId ? (
                <Badge variant="outline">Custom</Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-bold">{exercise.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One permanent page for every record and completed performance of
              this exercise.
            </p>
            {exercise.secondaryMuscles.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {exercise.secondaryMuscles.map((muscle) => (
                  <Badge key={muscle} variant="outline">
                    {muscle}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <Button asChild>
            <Link href="/workouts/new">Log workout</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">Movement Video</h2>
        </CardHeader>
        <CardContent>
          {exercise.videoUrl ? (
            <div className="flex justify-center">
              <video
                src={exercise.videoUrl}
                controls
                playsInline
                preload="auto"
                aria-label={`${exercise.name} movement video`}
                className="block h-auto w-auto max-h-[28rem] max-w-full rounded-xl lg:max-h-[32rem] lg:max-w-lg"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No video is available for this exercise yet.
            </p>
          )}
        </CardContent>
      </Card>

      {performances.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-semibold">No completed performances yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete this exercise in a workout to start tracking records.
              </p>
            </div>
            <Button asChild>
              <Link href="/workouts/new">Start a workout</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  Completed sessions
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {performances.length.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">First performed</p>
                <p className="mt-1 text-lg font-bold">
                  <LocalWorkoutDateTime value={firstPerformance.startedAt} format="date" />
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Last performed</p>
                <p className="mt-1 text-lg font-bold">
                  <LocalWorkoutDateTime
                    value={lastPerformance?.startedAt ?? firstPerformance.startedAt}
                    format="date"
                  />
                </p>
              </CardContent>
            </Card>
          </div>

          <section aria-labelledby="record-summary-title">
            <div className="mb-3">
              <h2 id="record-summary-title" className="text-xl font-semibold">
                Personal records
              </h2>
              <p className="text-sm text-muted-foreground">
                Best completed performance for each supported metric.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {records.map((record) => (
                <Card key={record.metric.key}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {record.metric.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {formatExerciseRecordMetricValue(
                        record.metric,
                        record.value
                      )}
                    </p>
                    <Link
                      href={`/workouts/${record.workoutId}`}
                      className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                      aria-label={`View workout where ${record.metric.label} was achieved`}
                    >
                      <LocalWorkoutDateTime value={record.achievedAt} format="date" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <ExerciseProgressChart data={performances} metrics={chartMetrics} />

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Record history</h2>
              <p className="text-sm text-muted-foreground">
                Each time a completed workout established a new best.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {recordHistory
                .slice()
                .reverse()
                .slice(0, 30)
                .map((record, index) => (
                  <Link
                    key={`${record.metric.key}-${record.workoutId}-${index}`}
                    href={`/workouts/${record.workoutId}`}
                    className="flex flex-col gap-2 rounded-xl border p-3 transition hover:border-primary/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{record.metric.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {record.workoutTitle ?? "Workout"} ·{" "}
                        <LocalWorkoutDateTime value={record.achievedAt} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">PR</Badge>
                      <span className="font-bold">
                        {formatExerciseRecordMetricValue(
                          record.metric,
                          record.value
                        )}
                      </span>
                    </div>
                  </Link>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Recent performances</h2>
              <p className="text-sm text-muted-foreground">
                Workout-level summaries from the latest completed sessions.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentPerformances.map((performance) => (
                <Link
                  key={performance.workoutId}
                  href={`/workouts/${performance.workoutId}`}
                  className="block rounded-xl border p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {performance.workoutTitle ?? "Workout"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <LocalWorkoutDateTime value={performance.startedAt} />
                      </p>
                    </div>
                    <div className="flex max-w-xl flex-wrap gap-2 sm:justify-end">
                      {metrics
                        .filter((metric) => recentMetricKeys.has(metric.key))
                        .flatMap((metric) => {
                          const value = performance.values[metric.key];
                          return value === null
                            ? []
                            : [
                                <Badge key={metric.key} variant="outline">
                                  {metric.shortLabel}:{" "}
                                  {formatExerciseRecordMetricValue(
                                    metric,
                                    value
                                  )}
                                </Badge>,
                              ];
                        })}
                    </div>
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
