"use client";

import Link from "next/link";
import { ArrowRight, Dumbbell, ListChecks, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatElapsedTime } from "@/components/workouts/hooks/useWorkoutTimer";
import { useActiveWorkoutSummary } from "@/components/workouts/useActiveWorkoutSummary";

export function HomeWorkoutActions() {
  const activeWorkout = useActiveWorkoutSummary();

  if (activeWorkout === undefined) {
    return <div className="h-11 w-full max-w-sm animate-pulse rounded-lg bg-muted/50" />;
  }

  return (
    <div className="grid gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3">
      <Button asChild size="lg">
        <Link href="/workouts/new">
          <Dumbbell className="size-4" />
          {activeWorkout ? "Return to Workout" : "Start Workout"}
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/routines">
          <ListChecks className="size-4" /> Choose Routine
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/profile/supplements" aria-label="Open Supplements">
          <Pill className="size-4" /> Supplements
        </Link>
      </Button>
    </div>
  );
}

export function HomeContinueJourney() {
  const activeWorkout = useActiveWorkoutSummary();

  if (!activeWorkout) return null;

  const progress =
    activeWorkout.totalSets > 0
      ? Math.round(
          (activeWorkout.completedSets / activeWorkout.totalSets) * 100
        )
      : 0;
  const status =
    activeWorkout.timer.status === "running"
      ? "In progress"
      : activeWorkout.timer.status === "paused"
        ? "Paused"
        : "Draft saved";

  return (
    <section aria-labelledby="continue-journey-heading">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Active workout
          </p>
          <h2 id="continue-journey-heading" className="mt-2 text-2xl font-bold">
            Continue Journey
          </h2>
        </div>
      </div>
      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="truncate text-xl font-semibold">
                {activeWorkout.title ?? "Active Workout"}
              </p>
              <span className="text-xs font-medium text-primary">{status}</span>
            </div>
            <p className="mt-2 text-sm tabular-nums text-muted-foreground">
              {formatElapsedTime(activeWorkout.elapsedSeconds)} elapsed
              {activeWorkout.exerciseCount > 0
                ? ` · ${activeWorkout.exerciseCount} exercises`
                : ""}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Progress value={progress} className="h-2 max-w-md" />
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {activeWorkout.completedSets}/{activeWorkout.totalSets} sets
              </span>
            </div>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/workouts/new">
              Resume <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
