export type WorkoutTimerStatus = "idle" | "running" | "paused";

export type StoredWorkoutTimerState = {
  status: WorkoutTimerStatus;
  startedAtMs: number | null;
  accumulatedMs: number;
};

export const EMPTY_WORKOUT_TIMER_STATE: StoredWorkoutTimerState = {
  status: "idle",
  startedAtMs: null,
  accumulatedMs: 0,
};

export const ACTIVE_WORKOUT_SESSION_ID_KEY =
  "calistheni-active-workout-session-id";
export const ACTIVE_WORKOUT_TIMER_PREFIX = "calistheni-workout-timer:";
export const ACTIVE_WORKOUT_DRAFT_PREFIX = "calistheni-workout-draft:";
export const ACTIVE_WORKOUT_TIMER_EVENT = "calistheni-workout-timer-updated";

export function getWorkoutTimerStorageKey(sessionId: string) {
  return `${ACTIVE_WORKOUT_TIMER_PREFIX}${sessionId}`;
}

export function getWorkoutDraftStorageKey(sessionId: string) {
  return `${ACTIVE_WORKOUT_DRAFT_PREFIX}${sessionId}`;
}

export function getElapsedMs(
  state: StoredWorkoutTimerState,
  nowMs = Date.now()
) {
  return (
    state.accumulatedMs +
    (state.status === "running" && state.startedAtMs !== null
      ? nowMs - state.startedAtMs
      : 0)
  );
}

export function readStoredWorkoutTimer(
  storageKey: string
): StoredWorkoutTimerState {
  try {
    const value = window.localStorage.getItem(storageKey);

    if (!value) {
      return EMPTY_WORKOUT_TIMER_STATE;
    }

    const parsed = JSON.parse(value) as Partial<StoredWorkoutTimerState>;

    if (
      parsed.status !== "idle" &&
      parsed.status !== "running" &&
      parsed.status !== "paused"
    ) {
      return EMPTY_WORKOUT_TIMER_STATE;
    }

    return {
      status: parsed.status,
      startedAtMs:
        typeof parsed.startedAtMs === "number" ? parsed.startedAtMs : null,
      accumulatedMs:
        typeof parsed.accumulatedMs === "number" ? parsed.accumulatedMs : 0,
    };
  } catch {
    return EMPTY_WORKOUT_TIMER_STATE;
  }
}

export function writeStoredWorkoutTimer(
  storageKey: string,
  state: StoredWorkoutTimerState,
  notify = true
) {
  if (state.status === "idle") {
    window.localStorage.removeItem(storageKey);
  } else {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }

  if (notify) {
    window.dispatchEvent(
      new CustomEvent(ACTIVE_WORKOUT_TIMER_EVENT, {
        detail: {
          storageKey,
        },
      })
    );
  }
}

export function getStoredActiveWorkoutSessionId() {
  return window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_ID_KEY);
}

export function createActiveWorkoutSessionId() {
  const sessionId = crypto.randomUUID();
  window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_ID_KEY, sessionId);

  return sessionId;
}

export function getOrCreateActiveWorkoutSessionId() {
  return getStoredActiveWorkoutSessionId() ?? createActiveWorkoutSessionId();
}

export function clearActiveWorkoutSessionStorage(sessionId: string) {
  window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_ID_KEY);
  window.localStorage.removeItem(getWorkoutTimerStorageKey(sessionId));
  window.localStorage.removeItem(getWorkoutDraftStorageKey(sessionId));
  window.dispatchEvent(
    new CustomEvent(ACTIVE_WORKOUT_TIMER_EVENT, {
      detail: {
        storageKey: getWorkoutTimerStorageKey(sessionId),
      },
    })
  );
}
