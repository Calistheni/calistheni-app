"use client";

import { App } from "@capacitor/app";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelRestTimerNotification,
  removeDeliveredRestTimerNotification,
  scheduleRestTimerNotification,
} from "@/lib/native/rest-timer-notifications";
import { isNativeApp, isNativePluginAvailable } from "@/lib/native/platform";

type ActiveRestTimer = {
  id: string;
  workoutId: string;
  exerciseLocalId: string;
  exerciseName: string;
  durationSeconds: number;
  endsAtMs: number;
};
type AppState = "foreground" | "background";

const MUTED_KEY = "calistheni-rest-sound-muted";
const TIMER_KEY = "calistheni-active-rest-timer";
const SHOW_TEST_SOUND_BUTTON = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_REST_SOUND === "1";
const debug = (message: string, value?: unknown) => {
  if (process.env.NODE_ENV === "development") console.info(`[RestTimer] ${message}`, value ?? "");
};

function readTimer(): ActiveRestTimer | null {
  try {
    const raw = sessionStorage.getItem(TIMER_KEY);
    const timer = raw ? JSON.parse(raw) as ActiveRestTimer : null;
    return timer && typeof timer.id === "string" && typeof timer.workoutId === "string" && Number.isFinite(timer.endsAtMs) ? timer : null;
  } catch {
    return null;
  }
}

function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function useRestTimer() {
  const [activeTimer, setActiveTimer] = useState<ActiveRestTimer | null>(() => typeof window === "undefined" ? null : readTimer());
  const [nowMs, setNowMs] = useState(Date.now);
  const [isMuted, setIsMuted] = useState(() => typeof window === "undefined" ? false : readMuted());
  const activeTimerRef = useRef(activeTimer);
  const isMutedRef = useRef(isMuted);
  const appStateRef = useRef<AppState>("foreground");
  const audioContextRef = useRef<AudioContext | null>(null);
  const completedTimerIdRef = useRef<string | null>(null);
  const scheduledTimerIdRef = useRef<string | null>(null);
  const deliveredWhileBackgroundTimerIdRef = useRef<string | null>(null);

  useEffect(() => { activeTimerRef.current = activeTimer; }, [activeTimer]);
  useEffect(() => { isMutedRef.current = isMuted; try { localStorage.setItem(MUTED_KEY, isMuted ? "1" : "0"); } catch {} }, [isMuted]);
  useEffect(() => { try { if (activeTimer) sessionStorage.setItem(TIMER_KEY, JSON.stringify(activeTimer)); else sessionStorage.removeItem(TIMER_KEY); } catch {} }, [activeTimer]);

  const initializeAudio = useCallback(async () => {
    if (isMutedRef.current || typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    audioContextRef.current ??= new AudioContextConstructor();
    try {
      if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
      debug("audio mode=prewarmed-web-audio");
    } catch (error) {
      debug("foreground audio failed", error);
    }
  }, []);

  const playForegroundSound = useCallback(async () => {
    if (isMutedRef.current) { debug("muted - foreground sound skipped"); return; }
    await initializeAudio();
    const context = audioContextRef.current;
    if (!context) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime;
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(0.65, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.47);
      debug("foreground sound complete");
    } catch (error) {
      debug("foreground audio failed", error);
    }
  }, [initializeAudio]);

  const haptic = useCallback(async () => {
    if (isNativePluginAvailable("Haptics")) {
      await Haptics.notification({ type: NotificationType.Success }).catch((error) => debug("haptic failed", error));
    }
  }, []);

  const cancelBackgroundNotification = useCallback(async (timerId: string, reason: string) => {
    if (scheduledTimerIdRef.current === timerId) scheduledTimerIdRef.current = null;
    await cancelRestTimerNotification(timerId, reason);
  }, []);

  const scheduleBackgroundNotification = useCallback(async (timer: ActiveRestTimer, soundEnabled = !isMutedRef.current) => {
    if (!isNativeApp() || appStateRef.current !== "background" || activeTimerRef.current?.id !== timer.id || timer.endsAtMs <= Date.now()) return;
    if (scheduledTimerIdRef.current === timer.id) {
      debug("notification already scheduled - skipped", { timer: timer.id });
      return;
    }
    // A deterministic ID lets the native scheduler replace any stale copy of this session.
    await cancelRestTimerNotification(timer.id, "replace-before-background-schedule");
    if (appStateRef.current !== "background" || activeTimerRef.current?.id !== timer.id || timer.endsAtMs <= Date.now()) return;
    const scheduled = await scheduleRestTimerNotification(timer, timer.endsAtMs, soundEnabled);
    if (scheduled) {
      scheduledTimerIdRef.current = timer.id;
      debug("scheduling background notification", { timer: timer.id, endsAt: timer.endsAtMs });
    }
  }, []);

  const completeForeground = useCallback(async (timer: ActiveRestTimer) => {
    if (completedTimerIdRef.current === timer.id) return;
    completedTimerIdRef.current = timer.id;
    await cancelBackgroundNotification(timer.id, "foreground-completion");
    // Defense in depth: a rest notification delivered in foreground must not remain in history.
    await removeDeliveredRestTimerNotification(timer.id);
    debug("completed foreground - playing sound only", { timer: timer.id });
    await playForegroundSound();
    await haptic();
    setActiveTimer((current) => current?.id === timer.id ? null : current);
  }, [cancelBackgroundNotification, haptic, playForegroundSound]);

  const completeAfterBackground = useCallback((timer: ActiveRestTimer) => {
    if (completedTimerIdRef.current === timer.id) return;
    completedTimerIdRef.current = timer.id;
    scheduledTimerIdRef.current = scheduledTimerIdRef.current === timer.id ? null : scheduledTimerIdRef.current;
    debug("completed while background - native notification handled completion", { timer: timer.id });
    setActiveTimer((current) => current?.id === timer.id ? null : current);
  }, []);

  useEffect(() => {
    if (!activeTimer) return;
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      if (appStateRef.current === "foreground" && now >= activeTimer.endsAtMs) void completeForeground(activeTimer);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [activeTimer, completeForeground]);

  // The sole Capacitor lifecycle owner. It is registered once and reads current timer data from refs,
  // preventing stale async listeners from scheduling duplicate native notifications after rerenders.
  useEffect(() => {
    if (!isNativeApp()) return;
    let disposed = false;
    let pauseHandle: { remove: () => Promise<void> } | undefined;
    let resumeHandle: { remove: () => Promise<void> } | undefined;
    let deliveredHandle: { remove: () => Promise<void> } | undefined;

    void App.addListener("pause", () => {
      appStateRef.current = "background";
      const timer = activeTimerRef.current;
      debug("app pause", { timer: timer?.id });
      if (timer) void scheduleBackgroundNotification(timer);
    }).then((handle) => { if (disposed) void handle.remove(); else pauseHandle = handle; });

    void App.addListener("resume", () => {
      appStateRef.current = "foreground";
      const timer = activeTimerRef.current;
      debug("app resume", { timer: timer?.id });
      if (!timer) return;
      void (async () => {
        // This must be first: returning before expiry means there can never be a later system alert.
        const notificationWasScheduled = scheduledTimerIdRef.current === timer.id;
        await cancelBackgroundNotification(timer.id, "app-resume");
        if (activeTimerRef.current?.id !== timer.id) return;
        if (Date.now() >= timer.endsAtMs) {
          if (deliveredWhileBackgroundTimerIdRef.current === timer.id || notificationWasScheduled) completeAfterBackground(timer);
          else void completeForeground(timer);
        } else {
          setNowMs(Date.now());
        }
      })();
    }).then((handle) => { if (disposed) void handle.remove(); else resumeHandle = handle; });

    if (isNativePluginAvailable("LocalNotifications")) {
      void LocalNotifications.addListener("localNotificationReceived", (notification) => {
        const extra = notification.extra as { type?: string; timerId?: string } | undefined;
        if (extra?.type !== "rest-timer" || typeof extra.timerId !== "string") return;
        if (appStateRef.current === "foreground") {
          debug("foreground rest notification received - removing delivered copy", { timer: extra.timerId });
          void removeDeliveredRestTimerNotification(extra.timerId);
          return;
        }
        deliveredWhileBackgroundTimerIdRef.current = extra.timerId;
      }).then((handle) => { if (disposed) void handle.remove(); else deliveredHandle = handle; });
    }

    return () => {
      disposed = true;
      void pauseHandle?.remove();
      void resumeHandle?.remove();
      void deliveredHandle?.remove();
    };
  }, [cancelBackgroundNotification, completeAfterBackground, completeForeground, scheduleBackgroundNotification]);

  const replace = useCallback((next: ActiveRestTimer | null, reason: string) => {
    const current = activeTimerRef.current;
    if (current && current.id !== next?.id) void cancelBackgroundNotification(current.id, reason);
    activeTimerRef.current = next;
    setActiveTimer(next);
  }, [cancelBackgroundNotification]);

  const remainingSeconds = activeTimer ? Math.max(0, Math.ceil((activeTimer.endsAtMs - nowMs) / 1000)) : 0;

  return useMemo(() => ({
    activeTimer,
    remainingSeconds,
    isMuted,
    showTestSoundButton: SHOW_TEST_SOUND_BUTTON,
    initializeAudio,
    testSound: async () => { await playForegroundSound(); },
    startRestTimer: ({ workoutId, exerciseLocalId, exerciseName, restSeconds }: { workoutId: string; exerciseLocalId: string; exerciseName: string; restSeconds: number }) => {
      if (restSeconds <= 0) return;
      const now = Date.now();
      const timer = { id: crypto.randomUUID(), workoutId, exerciseLocalId, exerciseName, durationSeconds: restSeconds, endsAtMs: now + restSeconds * 1000 };
      completedTimerIdRef.current = null;
      deliveredWhileBackgroundTimerIdRef.current = null;
      appStateRef.current = "foreground";
      setNowMs(now);
      replace(timer, "replaced");
      debug("started - app foreground, no notification scheduled", { timer: timer.id, endsAt: timer.endsAtMs });
      void initializeAudio();
    },
    addSeconds: (seconds: number) => setActiveTimer((current) => {
      if (!current) return current;
      void cancelBackgroundNotification(current.id, "timer-adjusted");
      const next = { ...current, endsAtMs: Math.max(current.endsAtMs, Date.now()) + seconds * 1000 };
      activeTimerRef.current = next;
      if (appStateRef.current === "background") void scheduleBackgroundNotification(next);
      return next;
    }),
    resetRestTimer: () => setActiveTimer((current) => {
      if (!current) return current;
      void cancelBackgroundNotification(current.id, "timer-reset");
      completedTimerIdRef.current = null;
      const next = { ...current, endsAtMs: Date.now() + current.durationSeconds * 1000 };
      activeTimerRef.current = next;
      if (appStateRef.current === "background") void scheduleBackgroundNotification(next);
      return next;
    }),
    skipRestTimer: () => replace(null, "skipped"),
    clearRestTimer: () => { completedTimerIdRef.current = null; replace(null, "cleared"); },
    toggleMuted: () => setIsMuted((current) => {
      const next = !current;
      if (activeTimerRef.current && appStateRef.current === "background") {
        void cancelBackgroundNotification(activeTimerRef.current.id, "mute-changed").then(() => scheduleBackgroundNotification(activeTimerRef.current!, !next));
      }
      return next;
    }),
  }), [activeTimer, cancelBackgroundNotification, initializeAudio, isMuted, playForegroundSound, remainingSeconds, replace, scheduleBackgroundNotification]);
}
