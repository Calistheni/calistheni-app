"use client";

import { useEffect, useMemo, useState } from "react";

type WorkoutTimerState = {
  status: "idle" | "running" | "paused";
  startedAtMs: number | null;
  accumulatedMs: number;
};

const EMPTY_TIMER_STATE: WorkoutTimerState = {
  status: "idle",
  startedAtMs: null,
  accumulatedMs: 0,
};

function getElapsedMs(state: WorkoutTimerState, nowMs = Date.now()) {
  return (
    state.accumulatedMs +
    (state.status === "running" && state.startedAtMs !== null
      ? nowMs - state.startedAtMs
      : 0)
  );
}

function readStoredTimer(storageKey: string): WorkoutTimerState {
  try {
    const value = window.localStorage.getItem(storageKey);

    if (!value) {
      return EMPTY_TIMER_STATE;
    }

    const parsed = JSON.parse(value) as Partial<WorkoutTimerState>;

    if (
      parsed.status !== "idle" &&
      parsed.status !== "running" &&
      parsed.status !== "paused"
    ) {
      return EMPTY_TIMER_STATE;
    }

    return {
      status: parsed.status,
      startedAtMs:
        typeof parsed.startedAtMs === "number" ? parsed.startedAtMs : null,
      accumulatedMs:
        typeof parsed.accumulatedMs === "number" ? parsed.accumulatedMs : 0,
    };
  } catch {
    return EMPTY_TIMER_STATE;
  }
}

export function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const shortTime = `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;

  return hours > 0 ? `${String(hours).padStart(2, "0")}:${shortTime}` : shortTime;
}

export function useWorkoutTimer(storageKey: string) {
  const [timerState, setTimerState] = useState<WorkoutTimerState>(
    () =>
      typeof window === "undefined"
        ? EMPTY_TIMER_STATE
        : readStoredTimer(storageKey)
  );
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (timerState.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [timerState.status]);

  useEffect(() => {
    if (timerState.status === "idle") {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(timerState));
  }, [storageKey, timerState]);

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
      pause: () =>
        {
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
      reset: () => setTimerState(EMPTY_TIMER_STATE),
    }),
    [elapsedSeconds, timerState.status]
  );
}
