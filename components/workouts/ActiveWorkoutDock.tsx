"use client";

import { useEffect, useMemo, useState } from "react";
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
  ACTIVE_WORKOUT_TIMER_EVENT,
  clearActiveWorkoutSessionStorage,
  EMPTY_WORKOUT_TIMER_STATE,
  getElapsedMs,
  getStoredActiveWorkoutSessionId,
  getWorkoutTimerStorageKey,
  readStoredWorkoutTimer,
  writeStoredWorkoutTimer,
  type StoredWorkoutTimerState,
} from "@/lib/active-workout-session";
import { isWorkoutBuilderRoute } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { formatElapsedTime } from "./hooks/useWorkoutTimer";

type ActiveWorkoutDockState = {
  sessionId: string;
  timerStorageKey: string;
  timer: StoredWorkoutTimerState;
};

function readActiveDockState(): ActiveWorkoutDockState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const sessionId = getStoredActiveWorkoutSessionId();

  if (!sessionId) {
    return null;
  }

  const timerStorageKey = getWorkoutTimerStorageKey(sessionId);

  return {
    sessionId,
    timerStorageKey,
    timer: readStoredWorkoutTimer(timerStorageKey),
  };
}

export function ActiveWorkoutDock() {
  const router = useRouter();
  const pathname = usePathname();
  const [dockState, setDockState] = useState<ActiveWorkoutDockState | null>(
    null
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  useEffect(() => {
    function syncDockState() {
      setDockState(readActiveDockState());
      setNowMs(Date.now());
    }

    syncDockState();

    const interval = window.setInterval(syncDockState, 1000);

    window.addEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncDockState);
    window.addEventListener("storage", syncDockState);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncDockState);
      window.removeEventListener("storage", syncDockState);
    };
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!dockState) {
      return 0;
    }

    return Math.floor(getElapsedMs(dockState.timer, nowMs) / 1000);
  }, [dockState, nowMs]);

  if (
    !dockState ||
    pathname.startsWith("/admin") ||
    isWorkoutBuilderRoute(pathname)
  ) {
    return null;
  }

  function updateTimer(nextTimer: StoredWorkoutTimerState) {
    if (!dockState) {
      return;
    }

    writeStoredWorkoutTimer(dockState.timerStorageKey, nextTimer);
    setDockState({
      ...dockState,
      timer: nextTimer,
    });
    setNowMs(Date.now());
  }

  function pauseTimer() {
    if (!dockState || dockState.timer.status !== "running") {
      return;
    }

    const pausedAtMs = Date.now();

    updateTimer({
      status: "paused",
      startedAtMs: null,
      accumulatedMs: getElapsedMs(dockState.timer, pausedAtMs),
    });
  }

  function resumeTimer() {
    if (!dockState || dockState.timer.status === "running") {
      return;
    }

    updateTimer({
      ...dockState.timer,
      status: "running",
      startedAtMs: Date.now(),
    });
  }

  function resetTimer() {
    updateTimer(EMPTY_WORKOUT_TIMER_STATE);
  }

  function discardWorkout() {
    if (!dockState) {
      return;
    }

    clearActiveWorkoutSessionStorage(dockState.sessionId);
    setDockState(null);
    setShowDiscardDialog(false);

    if (pathname.startsWith("/workouts/new")) {
      router.push("/workouts");
    }
  }

  const isRunning = dockState.timer.status === "running";
  return (
    <>
      <div
        data-active-workout-dock
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[calc(100%-1rem)] max-w-xl justify-center px-2",
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
                {formatElapsedTime(elapsedSeconds)}
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
