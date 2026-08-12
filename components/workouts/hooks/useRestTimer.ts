"use client";

import { App } from "@capacitor/app";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelRestTimerNotification, removeDeliveredRestTimerNotification, scheduleRestTimerNotification } from "@/lib/native/rest-timer-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeApp, isNativePluginAvailable } from "@/lib/native/platform";

type ActiveRestTimer = { id: string; exerciseLocalId: string; exerciseName: string; durationSeconds: number; endsAtMs: number };
type AppState = "foreground" | "background";
const MUTED_KEY = "calistheni-rest-sound-muted";
const TIMER_KEY = "calistheni-active-rest-timer";
const SHOW_TEST_SOUND_BUTTON = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_REST_SOUND === "1";
const debug = (message: string, value?: unknown) => { if (process.env.NODE_ENV === "development") console.info(`[RestTimer] ${message}`, value ?? ""); };
function readTimer(): ActiveRestTimer | null { try { const raw = sessionStorage.getItem(TIMER_KEY); const timer = raw ? JSON.parse(raw) as ActiveRestTimer : null; return timer && typeof timer.id === "string" && Number.isFinite(timer.endsAtMs) ? timer : null; } catch { return null; } }
function readMuted() { try { return localStorage.getItem(MUTED_KEY) === "1"; } catch { return false; } }

export function useRestTimer() {
  const [activeTimer, setActiveTimer] = useState<ActiveRestTimer | null>(() => typeof window === "undefined" ? null : readTimer());
  const [nowMs, setNowMs] = useState(Date.now);
  const [isMuted, setIsMuted] = useState(() => typeof window === "undefined" ? false : readMuted());
  const appStateRef = useRef<AppState>("foreground");
  const audioContextRef = useRef<AudioContext | null>(null);
  const completedTimerIdRef = useRef<string | null>(null);
  const backgroundNotificationTimerIdRef = useRef<string | null>(null);
  const backgroundNotificationDeliveredTimerIdRef = useRef<string | null>(null);

  const initializeAudio = useCallback(async () => {
    if (isMuted || typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    audioContextRef.current ??= new AudioContextConstructor();
    try { if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume(); debug("audio mode=prewarmed-web-audio"); }
    catch (error) { debug("foreground audio failed", error); }
  }, [isMuted]);
  const playForegroundSound = useCallback(async () => {
    if (isMuted) { debug("muted - foreground sound skipped"); return; }
    debug("playing foreground sound");
    await initializeAudio(); const context = audioContextRef.current;
    if (!context) { debug("foreground audio failed", "AudioContext unavailable"); return; }
    try { const oscillator = context.createOscillator(); const gain = context.createGain(); const at = context.currentTime; oscillator.frequency.value = 880; gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(.65, at + .008); gain.gain.exponentialRampToValueAtTime(.001, at + .45); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + .47); debug("foreground sound complete"); }
    catch (error) { debug("foreground audio failed", error); }
  }, [initializeAudio, isMuted]);
  const haptic = useCallback(async () => { if (isNativePluginAvailable("Haptics")) await Haptics.notification({ type: NotificationType.Success }).catch((error) => debug("haptic failed", error)); }, []);
  const scheduleForBackground = useCallback((timer: ActiveRestTimer, muted = isMuted) => {
    if (!isNativeApp()) return;
    if (timer.endsAtMs <= Date.now()) return;
    void scheduleRestTimerNotification(timer.id, timer.endsAtMs, !muted).then((scheduled) => { if (scheduled) debug("notification scheduled", { timer: timer.id, sound: !muted }); }).catch((error) => debug("notification schedule failed", error));
  }, [isMuted]);
  const cancel = useCallback((timerId: string, reason: string) => { backgroundNotificationTimerIdRef.current = backgroundNotificationTimerIdRef.current === timerId ? null : backgroundNotificationTimerIdRef.current; void cancelRestTimerNotification(timerId, reason); }, []);
  const completeForeground = useCallback(async (timer: ActiveRestTimer) => {
    if (completedTimerIdRef.current === timer.id) return;
    completedTimerIdRef.current = timer.id; debug("foreground completion", { timer: timer.id });
    cancel(timer.id, "foreground-completion"); void removeDeliveredRestTimerNotification(timer.id); debug("notification cancelled for foreground completion", { timer: timer.id });
    await playForegroundSound(); await haptic(); setActiveTimer((current) => current?.id === timer.id ? null : current);
  }, [cancel, haptic, playForegroundSound]);
  const completeAfterBackground = useCallback((timer: ActiveRestTimer) => {
    if (completedTimerIdRef.current === timer.id) return;
    completedTimerIdRef.current = timer.id; debug("timer expired while backgrounded", { timer: timer.id }); debug("feedback already handled by notification", { timer: timer.id }); setActiveTimer((current) => current?.id === timer.id ? null : current);
  }, []);

  useEffect(() => { try { localStorage.setItem(MUTED_KEY, isMuted ? "1" : "0"); } catch {} }, [isMuted]);
  useEffect(() => { try { if (activeTimer) sessionStorage.setItem(TIMER_KEY, JSON.stringify(activeTimer)); else sessionStorage.removeItem(TIMER_KEY); } catch {} }, [activeTimer]);
  useEffect(() => { if (!activeTimer) return; const tick = () => { const now = Date.now(); setNowMs(now); if (appStateRef.current === "foreground" && now >= activeTimer.endsAtMs) void completeForeground(activeTimer); }; tick(); const interval = window.setInterval(tick, 250); return () => clearInterval(interval); }, [activeTimer, completeForeground]);
  useEffect(() => {
    if (!isNativeApp()) return;
    let pause: { remove: () => Promise<void> } | undefined; let resume: { remove: () => Promise<void> } | undefined; let delivered: { remove: () => Promise<void> } | undefined;
    void App.addListener("pause", () => { appStateRef.current = "background"; debug("app background"); const timer = activeTimer; if (!timer || timer.endsAtMs <= Date.now()) return; backgroundNotificationTimerIdRef.current = timer.id; scheduleForBackground(timer); }).then((handle) => { pause = handle; });
    void App.addListener("resume", () => { appStateRef.current = "foreground"; debug("app foreground"); const timer = activeTimer; if (!timer) return; const deliveredInBackground = backgroundNotificationDeliveredTimerIdRef.current === timer.id || backgroundNotificationTimerIdRef.current === timer.id; cancel(timer.id, "app-foreground"); if (Date.now() >= timer.endsAtMs) { if (deliveredInBackground) completeAfterBackground(timer); else void completeForeground(timer); } else setNowMs(Date.now()); }).then((handle) => { resume = handle; });
    if (isNativePluginAvailable("LocalNotifications")) void LocalNotifications.addListener("localNotificationReceived", (notification) => { const extra = notification.extra as { type?: string; timerId?: string } | undefined; if (extra?.type === "rest-timer" && typeof extra.timerId === "string") backgroundNotificationDeliveredTimerIdRef.current = extra.timerId; }).then((handle) => { delivered = handle; });
    return () => { void pause?.remove(); void resume?.remove(); void delivered?.remove(); };
  }, [activeTimer, cancel, completeAfterBackground, completeForeground, scheduleForBackground]);
  const replace = useCallback((next: ActiveRestTimer | null, reason: string) => { if (activeTimer && activeTimer.id !== next?.id) cancel(activeTimer.id, reason); setActiveTimer(next); }, [activeTimer, cancel]);
  const remainingSeconds = activeTimer ? Math.max(0, Math.ceil((activeTimer.endsAtMs - nowMs) / 1000)) : 0;

  return useMemo(() => ({ activeTimer, remainingSeconds, isMuted, showTestSoundButton: SHOW_TEST_SOUND_BUTTON, initializeAudio, testSound: async () => { await playForegroundSound(); },
    startRestTimer: ({ exerciseLocalId, exerciseName, restSeconds }: { exerciseLocalId: string; exerciseName: string; restSeconds: number }) => { if (restSeconds <= 0) return; const now = Date.now(); const timer = { id: crypto.randomUUID(), exerciseLocalId, exerciseName, durationSeconds: restSeconds, endsAtMs: now + restSeconds * 1000 }; completedTimerIdRef.current = null; backgroundNotificationTimerIdRef.current = null; backgroundNotificationDeliveredTimerIdRef.current = null; appStateRef.current = "foreground"; setNowMs(now); replace(timer, "replaced"); debug("started", { timer: timer.id, endsAt: timer.endsAtMs }); void initializeAudio(); },
    addSeconds: (seconds: number) => setActiveTimer((current) => { if (!current) return current; cancel(current.id, "timer-adjusted"); const next = { ...current, endsAtMs: Math.max(current.endsAtMs, Date.now()) + seconds * 1000 }; if (appStateRef.current === "background") scheduleForBackground(next); return next; }),
    resetRestTimer: () => setActiveTimer((current) => { if (!current) return current; cancel(current.id, "timer-reset"); completedTimerIdRef.current = null; const next = { ...current, endsAtMs: Date.now() + current.durationSeconds * 1000 }; if (appStateRef.current === "background") scheduleForBackground(next); return next; }),
    skipRestTimer: () => replace(null, "skipped"), clearRestTimer: () => { completedTimerIdRef.current = null; replace(null, "cleared"); },
    toggleMuted: () => setIsMuted((current) => { const next = !current; if (activeTimer && appStateRef.current === "background") { cancel(activeTimer.id, "mute-changed"); scheduleForBackground(activeTimer, next); } return next; }),
  }), [activeTimer, cancel, initializeAudio, isMuted, playForegroundSound, remainingSeconds, replace, scheduleForBackground]);
}
