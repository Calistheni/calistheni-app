import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, History, ListChecks, Plus, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { TrainWorkoutLauncher } from "@/components/workouts/TrainWorkoutLauncher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Train",
  robots: { index: false, follow: false },
};

export default async function WorkoutsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [workouts, routines] = await Promise.all([
    prisma.workout.findMany({
      where: { userId: session.user.id },
      orderBy: { startedAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, image: true, bodyweightKg: true },
        },
        exercises: { include: { exercise: true, sets: true } },
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
        _count: { select: { exercises: true } },
      },
    }),
  ]);
  const summaries = workouts.map(mapWorkoutSummary);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-5">
        <p className="text-sm font-medium text-primary">Training</p>
        <h1 className="text-3xl font-bold tracking-tight">Train</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start quickly, follow a routine, or review your progress.
        </p>
      </header>

      <section aria-labelledby="workout-launcher-heading" className="mb-7">
        <h2 id="workout-launcher-heading" className="sr-only">
          Workout launcher
        </h2>
        <TrainWorkoutLauncher />
      </section>

      <section aria-labelledby="routines-heading" className="mb-7 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="routines-heading" className="text-xl font-semibold">
              Routines
            </h2>
            <p className="text-sm text-muted-foreground">
              Repeat your saved training plans.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/routines/new">
                <Plus className="size-4" /> New
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/routines">View All</Link>
            </Button>
          </div>
        </div>

        {routines.length ? (
          <div className="divide-y rounded-xl border bg-card">
            {routines.map((routine) => (
              <div
                key={routine.id}
                className="flex min-w-0 items-center gap-3 p-3 sm:p-4"
              >
                <ListChecks className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/routines/${routine.id}`}
                    className="block truncate font-medium hover:text-primary"
                  >
                    {routine.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {routine._count.exercises} exercises
                    {routine.description ? ` · ${routine.description}` : ""}
                  </p>
                </div>
                <Button asChild size="sm" className="shrink-0">
                  <Link href={`/workouts/new?routineId=${routine.id}`}>Start</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            No routines yet. Create one to make repeat workouts faster.
          </div>
        )}
      </section>

      <section aria-labelledby="training-tools-heading" className="mb-8">
        <h2 id="training-tools-heading" className="mb-3 text-xl font-semibold">
          Training tools
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" className="justify-start">
            <Link href="/exercises">
              <BookOpen className="size-4 text-primary" /> Exercise Library
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/profile/records">
              <Trophy className="size-4 text-primary" /> Personal Records
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="#workout-history">
              <History className="size-4 text-primary" /> Workout History
            </Link>
          </Button>
        </div>
      </section>

      <section id="workout-history" aria-labelledby="history-heading">
        <div className="mb-4">
          <h2 id="history-heading" className="text-xl font-semibold">
            Recent workouts
          </h2>
          <p className="text-sm text-muted-foreground">
            Completed sessions, volume, and exercise history.
          </p>
        </div>

        {summaries.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Your completed workouts will appear here.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {summaries.map((workout) => (
              <Link key={workout.id} href={`/workouts/${workout.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardHeader>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">
                          {workout.title ?? "Workout"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(workout.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            workout.visibility === "PUBLIC"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {workout.visibility === "PUBLIC" ? "Public" : "Private"}
                        </Badge>
                        <Badge variant="secondary">
                          {workout.exerciseCount} exercises
                        </Badge>
                        <Badge variant="outline">{workout.setCount} sets</Badge>
                        <Badge variant="outline">
                          {workout.totalVolume === null
                            ? "Volume unavailable"
                            : `${workout.totalVolume.toLocaleString()} volume`}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
