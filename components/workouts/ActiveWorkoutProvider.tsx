"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACTIVE_WORKOUT_TIMER_EVENT,
  getElapsedMs,
  readActiveWorkoutSummary,
  type ActiveWorkoutSummary,
} from "@/lib/active-workout-session";

const ActiveWorkoutContext = createContext<ActiveWorkoutSummary | null | undefined>(undefined);

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => {
      setActiveWorkout(readActiveWorkoutSummary());
      setNowMs(Date.now());
    };

    sync();
    window.addEventListener(ACTIVE_WORKOUT_TIMER_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_TIMER_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (activeWorkout?.timer.status !== "running") return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeWorkout?.timer.status]);

  const value = useMemo(() => {
    if (activeWorkout === null) return activeWorkout;
    return {
      ...activeWorkout,
      elapsedSeconds: Math.floor(getElapsedMs(activeWorkout.timer, nowMs) / 1000),
    };
  }, [activeWorkout, nowMs]);

  return <ActiveWorkoutContext.Provider value={value}>{children}</ActiveWorkoutContext.Provider>;
}

export function useActiveWorkout() {
  const value = useContext(ActiveWorkoutContext);
  if (value === undefined) throw new Error("useActiveWorkout must be used within ActiveWorkoutProvider.");
  return value;
}
