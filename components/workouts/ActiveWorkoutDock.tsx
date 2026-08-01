"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  clearActiveWorkoutSessionStorage,
  EMPTY_WORKOUT_TIMER_STATE,
  getElapsedMs,
  getWorkoutTimerStorageKey,
  writeStoredWorkoutTimer,
  type StoredWorkoutTimerState,
} from "@/lib/active-workout-session";
import { isWorkoutBuilderRoute } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { formatElapsedTime } from "./hooks/useWorkoutTimer";
import { useActiveWorkout } from "./ActiveWorkoutProvider";

export function ActiveWorkoutDock() {
  const router = useRouter();
  const pathname = usePathname();
  const activeWorkout = useActiveWorkout();
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  if (
    !activeWorkout ||
    pathname.startsWith("/admin") ||
    isWorkoutBuilderRoute(pathname)
  ) {
    return null;
  }
  const dockWorkout = activeWorkout;

  function updateTimer(nextTimer: StoredWorkoutTimerState) {
    writeStoredWorkoutTimer(getWorkoutTimerStorageKey(dockWorkout.sessionId), nextTimer);
  }

  function pauseTimer() {
    if (dockWorkout.timer.status !== "running") {
      return;
    }

    const pausedAtMs = Date.now();

    updateTimer({
      status: "paused",
      startedAtMs: null,
      accumulatedMs: getElapsedMs(dockWorkout.timer, pausedAtMs),
    });
  }

  function resumeTimer() {
    if (dockWorkout.timer.status === "running") {
      return;
    }

    updateTimer({
      ...dockWorkout.timer,
      status: "running",
      startedAtMs: Date.now(),
    });
  }

  function resetTimer() {
    updateTimer(EMPTY_WORKOUT_TIMER_STATE);
  }

  function discardWorkout() {
    clearActiveWorkoutSessionStorage(dockWorkout.sessionId);
    setShowDiscardDialog(false);

    if (pathname.startsWith("/workouts/new")) {
      router.push("/workouts");
    }
  }

  const isRunning = dockWorkout.timer.status === "running";
  return (
    <>
      <div
        data-active-workout-dock
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[calc(100%-1rem)] max-w-xl justify-center px-2",
          "md:bottom-4"
        )}
      >
        <div className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-popover p-2 shadow-lg sm:w-auto">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-11 min-w-0 rounded-xl"
          >
            <Link href="/workouts/new">
              <Image
                src="/icons/icon.png"
                alt=""
                width={24}
                height={24}
                className="size-6 rounded-md"
              />
              <span>Return</span>
              <span className="font-semibold tabular-nums">
                {formatElapsedTime(dockWorkout.elapsedSeconds)}
              </span>
            </Link>
          </Button>
          <div className="flex shrink-0 items-center gap-1">
            {isRunning ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-11 rounded-full"
                aria-label="Pause workout timer"
                onClick={pauseTimer}
              >
                <Pause className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-11 rounded-full"
                aria-label="Resume workout timer"
                onClick={resumeTimer}
              >
                <Play className="size-4" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-11 rounded-full"
              aria-label="Reset workout timer"
              onClick={resetTimer}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="size-11 rounded-full"
              aria-label="Discard workout"
              onClick={() => setShowDiscardDialog(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard active workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the workout timer and unsaved workout draft. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep workout</AlertDialogCancel>
            <AlertDialogAction onClick={discardWorkout}>
              Discard workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
