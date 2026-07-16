"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Clock3,
  Dumbbell,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatElapsedTime } from "@/components/workouts/hooks/useWorkoutTimer";
import { useActiveWorkoutSummary } from "@/components/workouts/useActiveWorkoutSummary";

export function TrainHeroActions() {
  const activeWorkout = useActiveWorkoutSummary();

  if (activeWorkout === undefined) {
    return <div className="h-11 w-full max-w-sm animate-pulse rounded-lg bg-muted/50" />;
  }

  return (
    <div className="flex flex-col gap-3 min-[360px]:flex-row">
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
    </div>
  );
}

export function TrainStartShowcase() {
  const activeWorkout = useActiveWorkoutSummary();

  if (activeWorkout === undefined) {
    return <div className="h-80 animate-pulse rounded-3xl border bg-muted/20" />;
  }

  const progress = activeWorkout
    ? activeWorkout.totalSets > 0
      ? Math.round((activeWorkout.completedSets / activeWorkout.totalSets) * 100)
      : 0
    : 36;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/70">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,var(--color-primary),transparent_36%)] opacity-[0.09]" />
      <div className="relative grid gap-10 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(24rem,1.2fr)] lg:items-center lg:gap-14 lg:p-10">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            {activeWorkout ? "Session in progress" : "Start from scratch"}
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
            {activeWorkout
              ? activeWorkout.title ?? "Your active workout"
              : "Build the session as you train."}
          </h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            {activeWorkout
              ? "Your draft, completed sets, and elapsed time are ready when you return."
              : "Add exercises, log each set, and let Calistheni keep the session organized without extra setup."}
          </p>
          {activeWorkout ? (
            <Button asChild size="lg" className="mt-7">
              <Link href="/workouts/new">
                Resume session <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <p className="mt-7 flex items-center gap-2 text-sm text-muted-foreground">
              <Dumbbell className="size-4 text-primary" aria-hidden="true" />
              Use Start Workout above when you are ready.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border/80 bg-background/85 p-4 shadow-2xl shadow-black/15 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {activeWorkout ? "Live session" : "Illustrative workout preview"}
              </p>
              <p className="mt-1 truncate font-semibold">
                {activeWorkout?.title ?? "New Workout"}
              </p>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {activeWorkout
                ? formatElapsedTime(activeWorkout.elapsedSeconds)
                : "00:00"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <PreviewMetric
              label="Exercises"
              value={activeWorkout ? activeWorkout.exerciseCount : 3}
            />
            <PreviewMetric
              label="Done sets"
              value={activeWorkout ? activeWorkout.completedSets : 2}
            />
            <PreviewMetric
              label="Total sets"
              value={activeWorkout ? activeWorkout.totalSets : 6}
            />
          </div>

          <div className="mt-5 space-y-2.5">
            {[0, 1, 2].map((index) => {
              const completed = activeWorkout
                ? index < Math.min(activeWorkout.completedSets, 3)
                : index === 0;
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-xl border bg-muted/15 px-3.5 py-3"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      completed
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {completed ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Circle className="size-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {activeWorkout ? `Exercise ${index + 1}` : ["Pull movement", "Push movement", "Core movement"][index]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {completed ? "Logged" : "Ready for your next set"}
                    </p>
                  </div>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {completed ? "Done" : "Next"}
                  </span>
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="mt-5 h-2" />
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/25 px-2 py-3">
      <p className="text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 text-[0.68rem] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
