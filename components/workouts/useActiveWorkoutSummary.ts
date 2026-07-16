"use client";

import { useEffect, useState } from "react";
import {
  ACTIVE_WORKOUT_TIMER_EVENT,
  readActiveWorkoutSummary,
  type ActiveWorkoutSummary,
} from "@/lib/active-workout-session";

export function useActiveWorkoutSummary() {
  const [activeWorkout, setActiveWorkout] =
    useState<ActiveWorkoutSummary | null>();

  useEffect(() => {
    function syncActiveWorkout() {
      setActiveWorkout(readActiveWorkoutSummary());
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

  return activeWorkout;
}
