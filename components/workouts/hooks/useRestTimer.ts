"use client";

import { App } from "@capacitor/app";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelRestTimerNotification, scheduleRestTimerNotification } from "@/lib/native/rest-timer-notifications";
import { isNativeApp, isNativePluginAvailable } from "@/lib/native/platform";

type ActiveRestTimer = { id: string; exerciseLocalId: string; exerciseName: string; durationSeconds: number; endsAtMs: number };
const REST_SOUND_MUTED_STORAGE_KEY = "calistheni-rest-sound-muted";
const REST_TIMER_STORAGE_KEY = "calistheni-active-rest-timer";
const SHOW_TEST_SOUND_BUTTON = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_REST_SOUND === "1";
const debug = (stage: string, payload?: unknown) => { if (process.env.NODE_ENV === "development") console.info(`[RestTimer] ${stage}`, payload ?? ""); };

function readTimer(): ActiveRestTimer | null { try { const value = sessionStorage.getItem(REST_TIMER_STORAGE_KEY); if (!value) return null; const parsed = JSON.parse(value) as ActiveRestTimer; return typeof parsed.id === "string" && Number.isFinite(parsed.endsAtMs) ? parsed : null; } catch { return null; } }
function readMuted() { try { return localStorage.getItem(REST_SOUND_MUTED_STORAGE_KEY) === "1"; } catch { return false; } }

export function useRestTimer() {
  const [activeTimer, setActiveTimer] = useState<ActiveRestTimer | null>(() => typeof window === "undefined" ? null : readTimer());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isMuted, setIsMuted] = useState(() => typeof window === "undefined" ? false : readMuted());
  const audioContextRef = useRef<AudioContext | null>(null);
  const completedTimerIdRef = useRef<string | null>(null);
  const nativeNotificationTimerIdRef = useRef<string | null>(null);

  const initializeAudio = useCallback(async () => {
    if (isMuted || typeof window === "undefined") return;
    const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return;
    audioContextRef.current ??= new Constructor();
    try { if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume(); debug("audio mode=web-audiocontext"); }
    catch (error) { debug("foreground audio failed", error); }
  }, [isMuted]);

  const triggerHaptic = useCallback(async () => {
    if (isNativePluginAvailable("Haptics")) await Haptics.notification({ type: NotificationType.Success }).catch((error) => debug("haptic failed", error));
  }, []);
  const playFeedback = useCallback(async () => {
    if (isMuted) { debug("muted - sound skipped"); return; }
    debug(`playing completion feedback mode=${isNativeApp() ? "native-haptic+web-audio" : "web"}`);
    // WebAudio is pre-unlocked on explicit workout interactions. Capacitor has
    // no bundled native short-audio plugin; local notifications cover suspended
    // native background execution while this covers active foreground playback.
    try {
      await initializeAudio(); const context = audioContextRef.current; if (context) { const oscillator = context.createOscillator(); const gain = context.createGain(); const at = context.currentTime; oscillator.frequency.value = 880; gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(.65, at + .008); gain.gain.exponentialRampToValueAtTime(.001, at + .45); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + .47); }
    } catch (error) { debug("foreground audio failed", error); }
    await triggerHaptic();
  }, [initializeAudio, isMuted, triggerHaptic]);

  const armNativeNotification = useCallback((timer: ActiveRestTimer) => {
    if (isMuted || !isNativeApp()) return;
    void scheduleRestTimerNotification(timer.id, timer.endsAtMs).then((scheduled) => {
      if (!scheduled) return;
      // The timer can finish while the native bridge is scheduling. Never let
      // that late promise leave a stale completion notification behind.
      if (completedTimerIdRef.current === timer.id) { void cancelRestTimerNotification(timer.id, "completed-before-schedule"); return; }
      nativeNotificationTimerIdRef.current = timer.id; debug("local notification scheduled", { id: timer.id, endsAt: timer.endsAtMs });
    }).catch((error) => debug("local notification schedule failed", error));
  }, [isMuted]);

  const complete = useCallback(async (timer: ActiveRestTimer, nativeSoundDelivered = false) => {
    if (completedTimerIdRef.current === timer.id) return;
    completedTimerIdRef.current = timer.id; debug("completed", { id: timer.id, endsAt: timer.endsAtMs });
    const nativeNotificationArmed = nativeNotificationTimerIdRef.current === timer.id;
    nativeNotificationTimerIdRef.current = null;
    if (nativeSoundDelivered || nativeNotificationArmed) await triggerHaptic();
    else { await cancelRestTimerNotification(timer.id, "foreground-complete"); await playFeedback(); }
    setActiveTimer((current) => current?.id === timer.id ? null : current);
  }, [playFeedback, triggerHaptic]);

  useEffect(() => { try { localStorage.setItem(REST_SOUND_MUTED_STORAGE_KEY, isMuted ? "1" : "0"); } catch {} }, [isMuted]);
  useEffect(() => { try { if (activeTimer) sessionStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify(activeTimer)); else sessionStorage.removeItem(REST_TIMER_STORAGE_KEY); } catch {} }, [activeTimer]);
  useEffect(() => { if (!activeTimer) return; const tick = () => { const now = Date.now(); setNowMs(now); if (now >= activeTimer.endsAtMs) void complete(activeTimer); }; tick(); const interval = window.setInterval(tick, 250); return () => clearInterval(interval); }, [activeTimer, complete]);
  useEffect(() => { if (!isNativeApp()) return; let handle: { remove: () => Promise<void> } | undefined; void App.addListener("appStateChange", ({ isActive }) => { const timer = activeTimer; if (!timer) return; if (!isActive) { armNativeNotification(timer); return; } const notified = nativeNotificationTimerIdRef.current === timer.id && Date.now() >= timer.endsAtMs; if (Date.now() >= timer.endsAtMs) void complete(timer, notified); else setNowMs(Date.now()); }).then((value) => { handle = value; }); return () => { void handle?.remove(); }; }, [activeTimer, armNativeNotification, complete]);

  const replace = useCallback((next: ActiveRestTimer | null, reason: string) => { const previous = activeTimer; if (previous && previous.id !== next?.id) void cancelRestTimerNotification(previous.id, reason); setActiveTimer(next); }, [activeTimer]);
  const remainingSeconds = activeTimer ? Math.max(0, Math.ceil((activeTimer.endsAtMs - nowMs) / 1000)) : 0;
  return useMemo(() => ({ activeTimer, remainingSeconds, isMuted, showTestSoundButton: SHOW_TEST_SOUND_BUTTON, initializeAudio, testSound: playFeedback,
    startRestTimer: ({ exerciseLocalId, exerciseName, restSeconds }: { exerciseLocalId: string; exerciseName: string; restSeconds: number }) => { if (restSeconds <= 0) return; const now = Date.now(); const timer = { id: crypto.randomUUID(), exerciseLocalId, exerciseName, durationSeconds: restSeconds, endsAtMs: now + restSeconds * 1000 }; completedTimerIdRef.current = null; setNowMs(now); replace(timer, "replaced"); armNativeNotification(timer); debug("started", { id: timer.id, endsAt: timer.endsAtMs }); void initializeAudio(); },
    addSeconds: (seconds: number) => setActiveTimer((current) => { if (!current) return current; void cancelRestTimerNotification(current.id, "timer-adjusted"); const next = { ...current, endsAtMs: Math.max(current.endsAtMs, Date.now()) + seconds * 1000 }; nativeNotificationTimerIdRef.current = null; armNativeNotification(next); debug("endsAt updated", { id: next.id, endsAt: next.endsAtMs }); return next; }),
    resetRestTimer: () => setActiveTimer((current) => { if (!current) return current; void cancelRestTimerNotification(current.id, "timer-reset"); completedTimerIdRef.current = null; const next = { ...current, endsAtMs: Date.now() + current.durationSeconds * 1000 }; nativeNotificationTimerIdRef.current = null; armNativeNotification(next); return next; }),
    skipRestTimer: () => replace(null, "skipped"), clearRestTimer: () => { completedTimerIdRef.current = null; replace(null, "cleared"); }, toggleMuted: () => setIsMuted((current) => { const next = !current; if (next && activeTimer) { void cancelRestTimerNotification(activeTimer.id, "muted"); nativeNotificationTimerIdRef.current = null; } if (!next && activeTimer) armNativeNotification(activeTimer); return next; }),
  }), [activeTimer, armNativeNotification, initializeAudio, isMuted, playFeedback, remainingSeconds, replace]);
}
