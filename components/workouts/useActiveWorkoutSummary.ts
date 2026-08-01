"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACTIVE_WORKOUT_TIMER_EVENT,
  getElapsedMs,
  readActiveWorkoutSummary,
  type ActiveWorkoutSummary,
} from "@/lib/active-workout-session";

export function useActiveWorkoutSummary() {
  const [activeWorkout, setActiveWorkout] =
    useState<ActiveWorkoutSummary | null>();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    function syncActiveWorkout() {
      setActiveWorkout(readActiveWorkoutSummary());
      setNowMs(Date.now());
    }

    syncActiveWorkout();
    window.addEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncActiveWorkout);
    window.addEventListener("storage", syncActiveWorkout);

    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncActiveWorkout);
      window.removeEventListener("storage", syncActiveWorkout);
    };
  }, []);

  useEffect(() => {
    if (activeWorkout?.timer.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [activeWorkout?.timer.status]);

  return useMemo(() => {
    if (!activeWorkout) {
      return activeWorkout;
    }

    return {
      ...activeWorkout,
      elapsedSeconds: Math.floor(
        getElapsedMs(activeWorkout.timer, nowMs) / 1000
      ),
    };
  }, [activeWorkout, nowMs]);
}
