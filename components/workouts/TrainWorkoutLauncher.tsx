"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ACTIVE_WORKOUT_TIMER_EVENT,
  getElapsedMs,
  getStoredActiveWorkoutSessionId,
  getWorkoutDraftStorageKey,
  getWorkoutTimerStorageKey,
  readStoredWorkoutTimer,
  type StoredWorkoutTimerState,
} from "@/lib/active-workout-session";
import { formatElapsedTime } from "./hooks/useWorkoutTimer";

type ActiveWorkoutState = {
  timer: StoredWorkoutTimerState;
  elapsedSeconds: number;
  title: string | null;
};

function readActiveWorkout(): ActiveWorkoutState | null {
  const sessionId = getStoredActiveWorkoutSessionId();
  if (!sessionId) return null;

  const timer = readStoredWorkoutTimer(getWorkoutTimerStorageKey(sessionId));
  let title: string | null = null;

  try {
    const draftValue = window.localStorage.getItem(
      getWorkoutDraftStorageKey(sessionId)
    );
    if (draftValue) {
      const draft = JSON.parse(draftValue) as { title?: unknown };
      title =
        typeof draft.title === "string" && draft.title.trim()
          ? draft.title.trim()
          : null;
    }
  } catch {
    title = null;
  }

  return {
    timer,
    elapsedSeconds: Math.floor(getElapsedMs(timer) / 1000),
    title,
  };
}

export function TrainWorkoutLauncher({
  context = "train",
}: {
  context?: "home" | "train";
}) {
  const [activeWorkout, setActiveWorkout] =
    useState<ActiveWorkoutState | null>();

  useEffect(() => {
    function syncActiveWorkout() {
      setActiveWorkout(readActiveWorkout());
    }

    syncActiveWorkout();
    const interval = window.setInterval(syncActiveWorkout, 1000);
    window.addEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncActiveWorkout);
    window.addEventListener("storage", syncActiveWorkout);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncActiveWorkout);
      window.removeEventListener("storage", syncActiveWorkout);
    };
  }, []);

  if (activeWorkout === undefined) {
    return <div className="h-24 animate-pulse rounded-xl border bg-muted/20" />;
  }

  if (activeWorkout) {
    const status =
      activeWorkout.timer.status === "running"
        ? "In progress"
        : activeWorkout.timer.status === "paused"
          ? "Paused"
          : "Draft saved";

    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">{status}</p>
            <p className="mt-1 text-lg font-semibold">
              {activeWorkout.title ?? "Continue Workout"}
            </p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {formatElapsedTime(activeWorkout.elapsedSeconds)} elapsed
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/workouts/new">
              Continue <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (context === "home") {
    return (
      <Card className="border-primary/25">
        <CardContent className="space-y-4 p-4 sm:flex sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <p className="text-lg font-semibold">Ready to train?</p>
            <p className="text-sm text-muted-foreground">
              Start empty or choose one of your routines.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild className="flex-1 sm:flex-none">
              <Link href="/workouts/new">
                <Dumbbell className="size-4" /> Start Workout
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <Link href="/routines">Choose Routine</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold">Quick Start</p>
          <p className="text-sm text-muted-foreground">
            Build a workout as you train.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/workouts/new">
            <Dumbbell className="size-4" /> Start Empty
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
