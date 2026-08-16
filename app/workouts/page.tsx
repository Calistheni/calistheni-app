import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Dumbbell,
  History,
  ListChecks,
  Plus,
  Trophy,
} from "lucide-react";
import { auth } from "@/auth";
import {
  PremiumEyebrow,
  PremiumLinkCard,
  PremiumSectionHeading,
} from "@/components/layout/PremiumPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrainHeroActions,
  TrainStartShowcase,
} from "@/components/workouts/TrainPageWorkout";
import { prisma } from "@/lib/prisma";
import { getPersistedVolumeSetCompletion } from "@/lib/workout-volume";
import { mapWorkoutSummary } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Train",
  robots: { index: false, follow: false },
};

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function completedSetCount(workout: {
  updatedAt: Date;
  exercises: Array<{ sets: Array<{ completed: boolean }> }>;
}) {
  return workout.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.filter(
        (set) =>
          getPersistedVolumeSetCompletion({
            completed: set.completed,
            workoutUpdatedAt: workout.updatedAt,
          }) !== false
      ).length,
    0
  );
}

export default async function WorkoutsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [workouts, routines] = await Promise.all([
    prisma.workout.findMany({
      where: { userId: session.user.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        visibility: true,
        user: {
          select: { id: true, name: true, image: true, bodyweightKg: true },
        },
        exercises: {
          orderBy: { order: "asc" },
          select: {
            exercise: {
              select: {
                trackingType: true,
                bodyweightLoadFactor: true,
              },
            },
            sets: {
              orderBy: { order: "asc" },
              select: { completed: true, reps: true, weight: true },
            },
          },
        },
      },
    }),
    prisma.workoutTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
        _count: { select: { exercises: true } },
      },
    }),
  ]);
  const summaries = workouts.map((workout) => ({
    summary: mapWorkoutSummary(workout),
    completedSets: completedSetCount(workout),
    completedAt: workout.completedAt ?? workout.startedAt,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <header className="max-w-4xl pb-16 sm:pb-20 lg:pb-24">
        <PremiumEyebrow>Training</PremiumEyebrow>
        <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          Build your next session.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Start from scratch, choose a routine, or review your latest training.
        </p>
        <div className="mt-8">
          <TrainHeroActions />
        </div>
      </header>

      <div className="space-y-16 sm:space-y-20 lg:space-y-24">
        <section aria-labelledby="start-training-heading">
          <h2 id="start-training-heading" className="sr-only">
            Start training
          </h2>
          <TrainStartShowcase />
        </section>

        <section aria-labelledby="routines-heading">
          <PremiumSectionHeading
            id="routines-heading"
            eyebrow="Saved training"
            title="Routines"
            description="Repeat a plan you trust or create the next one."
            action={
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/routines/new">
                    <Plus className="size-4" />
                    <span className="hidden min-[380px]:inline">New Routine</span>
                    <span className="min-[380px]:hidden">New</span>
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/routines">View all</Link>
                </Button>
              </div>
            }
          />

          {routines.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {routines.map((routine) => (
                <Card key={routine.id} className="rounded-2xl shadow-none">
                  <CardContent className="flex h-full flex-col p-5 sm:p-6">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ListChecks className="size-5" aria-hidden="true" />
                    </span>
                    <Link
                      href={`/routines/${routine.id}`}
                      className="mt-6 truncate text-xl font-semibold hover:text-primary"
                    >
                      {routine.name}
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {routine._count.exercises} exercise{routine._count.exercises === 1 ? "" : "s"} · Updated {formatDate(routine.updatedAt)}
                    </p>
                    {routine.description ? (
                      <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {routine.description}
                      </p>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        Ready to start when you are.
                      </p>
                    )}
                    <Button asChild className="mt-7 w-full sm:w-fit">
                      <Link href={`/workouts/new?routineId=${routine.id}`}>
                        Start <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl shadow-none">
              <CardContent className="flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">No routines yet</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Save a repeatable plan to make future sessions faster.
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/routines/new">Create Routine</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-labelledby="tools-heading">
          <PremiumSectionHeading
            id="tools-heading"
            eyebrow="Your training system"
            title="Training tools"
          />
          <div className="grid gap-4 md:grid-cols-3">
            <PremiumLinkCard
              href="/exercises"
              icon={BookOpen}
              title="Exercise Library"
              description="Browse movements, tracking types, and exercise details."
            />
            <PremiumLinkCard
              href="/profile/records"
              icon={Trophy}
              title="Personal Records"
              description="Review the strongest performances from completed sets."
            />
            <PremiumLinkCard
              href="#workout-history"
              icon={History}
              title="Workout History"
              description="Return to your latest completed training sessions."
            />
          </div>
        </section>

        <section id="workout-history" aria-labelledby="history-heading">
          <PremiumSectionHeading
            id="history-heading"
            eyebrow="Completed sessions"
            title="Recent workouts"
            description="Your latest logged training, completed sets, and volume."
          />

          {summaries.length === 0 ? (
            <Card className="rounded-2xl shadow-none">
              <CardContent className="flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">Your completed workouts will appear here.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Finish a session to begin building your history.
                  </p>
                </div>
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/workouts/new">Start Workout</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {summaries.map(({ summary, completedSets, completedAt }) => (
                <Link
                  key={summary.id}
                  href={`/workouts/${summary.id}`}
                  className="group rounded-2xl border border-border/80 bg-card/70 p-5 transition-colors hover:border-primary/40 hover:bg-card sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Dumbbell className="size-4.5" aria-hidden="true" />
                    </span>
                    <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-5 truncate text-xl font-semibold">
                    {summary.title ?? "Workout"}
                  </h3>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    {formatDate(completedAt)}
                  </p>
                  <div className="mt-5 grid grid-cols-3 border-t pt-4">
                    <WorkoutMetric label="Exercises" value={summary.exerciseCount.toLocaleString()} />
                    <WorkoutMetric label="Done sets" value={completedSets.toLocaleString()} bordered />
                    <WorkoutMetric
                      label="Volume"
                      value={
                        summary.totalVolume === null
                          ? "Unavailable"
                          : `${Math.round(summary.totalVolume).toLocaleString()} kg`
                      }
                      bordered
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8 lg:p-10">
          <div className="absolute right-0 bottom-0 size-56 translate-x-1/3 translate-y-1/3 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
            <div>
              <PremiumEyebrow>Keep building</PremiumEyebrow>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to improve your next session?
              </h2>
            </div>
            <div className="flex w-full flex-col gap-3 min-[390px]:w-auto min-[390px]:flex-row">
              <Button asChild>
                <Link href="/profile/records">View Personal Records</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/exercises">Browse Exercises</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkoutMetric({
  label,
  value,
  bordered = false,
}: {
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div className={`min-w-0 px-2 first:pl-0 ${bordered ? "border-l" : ""}`}>
      <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase sm:text-xs">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-base">
        {value}
      </p>
    </div>
  );
}
