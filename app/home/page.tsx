import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Dumbbell,
  ListChecks,
  MapPin,
  Trophy,
  UsersRound,
} from "lucide-react";
import { auth } from "@/auth";
import { TrainWorkoutLauncher } from "@/components/workouts/TrainWorkoutLauncher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { redirectIfOnboardingRequired } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

const workoutInclude = {
  user: {
    select: { id: true, name: true, image: true, bodyweightKg: true },
  },
  exercises: { include: { exercise: true, sets: true } },
} as const;

function getStartOfWeek() {
  const start = new Date();
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function formatDuration(startedAt: string, completedAt: string | null) {
  if (!completedAt) return "Duration unavailable";

  const minutes = Math.max(
    1,
    Math.round(
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000
    )
  );

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await redirectIfOnboardingRequired(session.user.id);

  const [weeklyWorkouts, recentWorkout, routines] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId: session.user.id,
        completedAt: { not: null },
        startedAt: { gte: getStartOfWeek() },
      },
      orderBy: { startedAt: "desc" },
      include: workoutInclude,
    }),
    prisma.workout.findFirst({
      where: { userId: session.user.id, completedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      include: workoutInclude,
    }),
    prisma.workoutTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        _count: { select: { exercises: true } },
      },
    }),
  ]);

  const weeklySummaries = weeklyWorkouts.map(mapWorkoutSummary);
  const weeklySets = weeklySummaries.reduce(
    (total, workout) => total + workout.setCount,
    0
  );
  const availableVolumes = weeklySummaries.flatMap((workout) =>
    workout.totalVolume === null ? [] : [workout.totalVolume]
  );
  const volumeTotal = availableVolumes.reduce((total, volume) => total + volume, 0);
  const weeklyVolumeLabel =
    weeklySummaries.length === 0
      ? "—"
      : availableVolumes.length === 0
        ? "Unavailable"
        : availableVolumes.length < weeklySummaries.length
          ? `${Math.round(volumeTotal).toLocaleString()} kg partial`
          : `${Math.round(volumeTotal).toLocaleString()} kg`;
  const recentSummary = recentWorkout ? mapWorkoutSummary(recentWorkout) : null;

  const quickActions = [
    { label: "Start Workout", href: "/workouts/new", icon: Dumbbell },
    { label: "Routines", href: "/routines", icon: ListChecks },
    { label: "Exercises", href: "/exercises", icon: BookOpen },
    { label: "Progress", href: "/profile/records", icon: Trophy },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <header className="mb-5">
        <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
        <h1 className="text-3xl font-bold tracking-tight">
          {session.user.name ?? "Calistheni athlete"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep the next session simple and keep moving forward.
        </p>
      </header>

      <section aria-labelledby="next-workout-heading" className="mb-6">
        <h2 id="next-workout-heading" className="sr-only">
          Your next workout
        </h2>
        <TrainWorkoutLauncher context="home" />
      </section>

      <section aria-labelledby="quick-actions-heading" className="mb-7">
        <h2 id="quick-actions-heading" className="mb-3 text-lg font-semibold">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.href}
                asChild
                variant="outline"
                className="h-auto justify-start px-3 py-3"
              >
                <Link href={action.href}>
                  <Icon className="size-4 text-primary" />
                  <span className="truncate">{action.label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

      <div className="mb-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section aria-labelledby="week-heading">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <h2 id="week-heading" className="text-xl font-semibold">
                This week
              </h2>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Workouts</p>
                <p className="mt-1 text-2xl font-bold">
                  {weeklySummaries.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sets</p>
                <p className="mt-1 text-2xl font-bold">{weeklySets}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Volume</p>
                <p className="mt-1 break-words text-base font-bold sm:text-lg">
                  {weeklyVolumeLabel}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="recent-heading">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <h2 id="recent-heading" className="text-xl font-semibold">
                Recent workout
              </h2>
            </CardHeader>
            <CardContent>
              {recentSummary ? (
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {recentSummary.title ?? "Workout"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(recentSummary.startedAt).toLocaleDateString()} · {formatDuration(recentSummary.startedAt, recentSummary.completedAt)} · {recentSummary.setCount} sets
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/workouts/${recentSummary.id}`}>View</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Finish a workout to see it here.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/workouts/new">Start Workout</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="routines-heading" className="mb-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="routines-heading" className="text-xl font-semibold">
            Your routines
          </h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/routines">
              View All <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        {routines.length ? (
          <div className="divide-y rounded-xl border bg-card">
            {routines.map((routine) => (
              <div key={routine.id} className="flex items-center gap-3 p-3 sm:p-4">
                <ListChecks className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/routines/${routine.id}`}
                    className="block truncate font-medium hover:text-primary"
                  >
                    {routine.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {routine._count.exercises} exercises
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/workouts/new?routineId=${routine.id}`}>Start</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Save a routine to start repeat sessions faster.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/routines/new">Create Routine</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-labelledby="explore-heading">
        <h2 id="explore-heading" className="mb-3 text-xl font-semibold">
          Explore
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/parks"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <MapPin className="size-5 text-primary" />
            <div>
              <p className="font-medium">Find a Park</p>
              <p className="text-sm text-muted-foreground">
                Discover outdoor training nearby.
              </p>
            </div>
          </Link>
          <Link
            href="/feed"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <UsersRound className="size-5 text-primary" />
            <div>
              <p className="font-medium">Community</p>
              <p className="text-sm text-muted-foreground">
                See workouts from athletes you follow.
              </p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
