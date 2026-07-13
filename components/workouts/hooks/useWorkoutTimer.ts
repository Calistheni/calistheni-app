"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACTIVE_WORKOUT_TIMER_EVENT,
  EMPTY_WORKOUT_TIMER_STATE,
  getElapsedMs,
  readStoredWorkoutTimer,
  writeStoredWorkoutTimer,
  type StoredWorkoutTimerState,
} from "@/lib/active-workout-session";

export function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const shortTime = `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;

  return hours > 0 ? `${String(hours).padStart(2, "0")}:${shortTime}` : shortTime;
}

export function useWorkoutTimer(storageKey: string, autoStart = false) {
  const [nowMs, setNowMs] = useState(0);
  const [timerState, setTimerState] = useState<StoredWorkoutTimerState>(
    EMPTY_WORKOUT_TIMER_STATE
  );
  const [initializedStorageKey, setInitializedStorageKey] = useState<
    string | null
  >(null);

  useEffect(() => {
    const initializeTimer = window.setTimeout(() => {
      const storedTimer = readStoredWorkoutTimer(storageKey);
      const initializedAtMs = Date.now();

      setNowMs(initializedAtMs);
      setTimerState(
        autoStart && storedTimer.status === "idle"
          ? {
              status: "running",
              startedAtMs: initializedAtMs,
              accumulatedMs: 0,
            }
          : storedTimer
      );
      setInitializedStorageKey(storageKey);
    }, 0);

    return () => window.clearTimeout(initializeTimer);
  }, [autoStart, storageKey]);

  useEffect(() => {
    function syncTimer(event: Event) {
      if (
        event instanceof CustomEvent &&
        event.detail?.storageKey &&
        event.detail.storageKey !== storageKey
      ) {
        return;
      }

      setNowMs(Date.now());
      setTimerState(readStoredWorkoutTimer(storageKey));
    }

    window.addEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncTimer);
    window.addEventListener("storage", syncTimer);

    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_TIMER_EVENT, syncTimer);
      window.removeEventListener("storage", syncTimer);
    };
  }, [storageKey]);

  useEffect(() => {
    if (timerState.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [timerState.status]);

  useEffect(() => {
    if (initializedStorageKey !== storageKey) {
      return;
    }

    writeStoredWorkoutTimer(storageKey, timerState, false);
  }, [initializedStorageKey, storageKey, timerState]);

  const elapsedSeconds = Math.floor(
    (nowMs === 0 ? timerState.accumulatedMs : getElapsedMs(timerState, nowMs)) /
      1000
  );

  return useMemo(
    () => ({
      elapsedSeconds,
      formattedElapsed: formatElapsedTime(elapsedSeconds),
      status: timerState.status,
      start: () => {
        const startedAtMs = Date.now();

        setNowMs(startedAtMs);
        setTimerState({
          status: "running",
          startedAtMs,
          accumulatedMs: 0,
        });
      },
      pause: () => {
        const pausedAtMs = Date.now();

        setNowMs(pausedAtMs);
        setTimerState((current) =>
          current.status === "running"
            ? {
                status: "paused",
                startedAtMs: null,
                accumulatedMs: getElapsedMs(current, pausedAtMs),
              }
            : current
        );
      },
      resume: () => {
        const startedAtMs = Date.now();

        setNowMs(startedAtMs);
        setTimerState((current) =>
          current.status === "paused"
            ? {
                ...current,
                status: "running",
                startedAtMs,
              }
            : current
        );
      },
      reset: () => setTimerState(EMPTY_WORKOUT_TIMER_STATE),
      clear: () => {
        window.localStorage.removeItem(storageKey);
        setNowMs(Date.now());
        setTimerState(EMPTY_WORKOUT_TIMER_STATE);
      },
    }),
    [elapsedSeconds, storageKey, timerState.status]
  );
}
