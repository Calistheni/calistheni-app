"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ActiveRestTimer = {
  exerciseLocalId: string;
  exerciseName: string;
  durationSeconds: number;
  endsAtMs: number;
};

const REST_SOUND_MUTED_STORAGE_KEY = "calistheni-rest-sound-muted";
const SHOW_TEST_SOUND_BUTTON =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_DEBUG_REST_SOUND === "1";

function readMutedPreference() {
  try {
    return window.localStorage.getItem(REST_SOUND_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

async function resumeAudioContext(audioContext: AudioContext) {
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

async function playRestCompleteBeep(audioContext: AudioContext) {
  await resumeAudioContext(audioContext);

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  if (process.env.NODE_ENV === "development") {
    console.info("Rest timer AudioContext state before beep", {
      state: audioContext.state,
    });
  }

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.4);
}

export function useRestTimer() {
  const [activeTimer, setActiveTimer] = useState<ActiveRestTimer | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [isMuted, setIsMuted] = useState(() =>
    typeof window === "undefined" ? false : readMutedPreference()
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const notifiedTimerRef = useRef<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      REST_SOUND_MUTED_STORAGE_KEY,
      isMuted ? "1" : "0"
    );
  }, [isMuted]);

  useEffect(() => {
    if (!activeTimer) {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, [activeTimer]);

  const remainingSeconds = activeTimer
    ? Math.max(0, Math.ceil((activeTimer.endsAtMs - nowMs) / 1000))
    : 0;

  useEffect(() => {
    if (!activeTimer || remainingSeconds > 0) {
      return;
    }

    const timerKey = `${activeTimer.exerciseLocalId}:${activeTimer.endsAtMs}`;

    if (notifiedTimerRef.current === timerKey) {
      return;
    }

    notifiedTimerRef.current = timerKey;

    if (!isMuted) {
      if (process.env.NODE_ENV === "development") {
        console.info("Rest timer reached zero; attempting beep.", {
          audioContextState: audioContextRef.current?.state ?? "not-created",
        });
      }

      try {
        const audioContext = audioContextRef.current;

        if (!audioContext) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "Rest timer beep skipped because AudioContext was not initialized by a user gesture."
            );
          }
          return;
        }

        void playRestCompleteBeep(audioContext);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.info("Rest timer AudioContext state after failure", {
            state: audioContextRef.current?.state ?? "not-created",
          });
        }
        console.error("Unable to play rest timer sound.", error);
      }
    }
  }, [activeTimer, isMuted, remainingSeconds]);

  return useMemo(
    () => ({
      activeTimer,
      remainingSeconds,
      isMuted,
      showTestSoundButton: SHOW_TEST_SOUND_BUTTON,
      initializeAudio: async () => {
        if (isMuted || typeof window === "undefined") {
          return;
        }

        const audioWindow = window as Window & {
          webkitAudioContext?: typeof AudioContext;
        };
        const AudioContextConstructor =
          window.AudioContext || audioWindow.webkitAudioContext;

        if (!AudioContextConstructor) {
          return;
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextConstructor();
        }

        try {
          await resumeAudioContext(audioContextRef.current);
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.info("Rest timer AudioContext state after resume failure", {
              state: audioContextRef.current.state,
            });
          }
          console.error("Unable to initialize rest timer sound.", error);
        }
      },
      testSound: async () => {
        if (isMuted) {
          return;
        }

        const audioContext = audioContextRef.current;

        if (!audioContext) {
          return;
        }

        try {
          await playRestCompleteBeep(audioContext);
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.info("Rest timer AudioContext state after test failure", {
              state: audioContext.state,
            });
          }
          console.error("Unable to test rest timer sound.", error);
        }
      },
      startRestTimer: ({
        exerciseLocalId,
        exerciseName,
        restSeconds,
      }: {
        exerciseLocalId: string;
        exerciseName: string;
        restSeconds: number;
      }) => {
        if (restSeconds <= 0) {
          return;
        }

        const durationSeconds = Math.max(0, restSeconds);

        notifiedTimerRef.current = null;
        setNowMs(Date.now());
        setActiveTimer({
          exerciseLocalId,
          exerciseName,
          durationSeconds,
          endsAtMs: Date.now() + durationSeconds * 1000,
        });
      },
      addSeconds: (seconds: number) =>
        setActiveTimer((current) =>
          current
            ? {
                ...current,
                endsAtMs:
                  Math.max(current.endsAtMs, Date.now()) + seconds * 1000,
              }
            : current
        ),
      resetRestTimer: () =>
        setActiveTimer((current) => {
          if (!current) {
            return current;
          }

          notifiedTimerRef.current = null;
          return {
            ...current,
            endsAtMs: Date.now() + current.durationSeconds * 1000,
          };
        }),
      skipRestTimer: () => setActiveTimer(null),
      clearRestTimer: () => {
        notifiedTimerRef.current = null;
        setActiveTimer(null);
      },
      toggleMuted: () => setIsMuted((current) => !current),
    }),
    [activeTimer, isMuted, remainingSeconds]
  );
}
