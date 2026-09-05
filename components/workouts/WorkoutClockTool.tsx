"use client";

import { App } from "@capacitor/app";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { TimerReset } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkoutTimeWheel } from "@/components/workouts/WorkoutTimeWheel";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cancelWorkoutClockNotification, scheduleWorkoutClockNotification } from "@/lib/native/workout-clock-notifications";
import { isNativeApp, isNativePluginAvailable } from "@/lib/native/platform";
import {
  addWorkoutCountdownTime,
  completeWorkoutCountdown,
  formatWorkoutCountdown,
  formatWorkoutStopwatch,
  getWorkoutCountdownRemainingMs,
  getWorkoutStopwatchElapsedMs,
  INITIAL_WORKOUT_STOPWATCH,
  initialWorkoutCountdown,
  pauseWorkoutCountdown,
  pauseWorkoutStopwatch,
  resumeWorkoutCountdown,
  resumeWorkoutStopwatch,
  startWorkoutCountdown,
  startWorkoutStopwatch,
} from "@/lib/workout-clock";
import { getWorkoutTimerDurationSeconds } from "@/lib/workout-clock-wheel";
import { cn } from "@/lib/utils";

type WorkoutClockToolProps = {
  workoutId: string;
  muted: boolean;
  onInitializeAudio: () => Promise<void>;
  onPlayCompletionSound: () => Promise<void>;
};

const TIMER_PRESETS = [30, 60, 120, 180, 300] as const;

export function WorkoutClockTool({ workoutId, muted, onInitializeAudio, onPlayCompletionSound }: WorkoutClockToolProps) {
  const [open, setOpen] = useState(false);
  const [stopwatch, setStopwatch] = useState(INITIAL_WORKOUT_STOPWATCH);
  const [countdown, setCountdown] = useState(() => initialWorkoutCountdown());
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(2);
  const [seconds, setSeconds] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now);
  const [completionMessage, setCompletionMessage] = useState("");
  const countdownRef = useRef(countdown);
  const mutedRef = useRef(muted);
  const appInBackgroundRef = useRef(false);
  const scheduledRunIdRef = useRef<string | null>(null);
  const completedRunIdRef = useRef<string | null>(null);

  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const cancelScheduledNotification = useCallback(async (runId: string) => {
    if (scheduledRunIdRef.current === runId) scheduledRunIdRef.current = null;
    await cancelWorkoutClockNotification(runId);
  }, []);

  const completeTimer = useCallback((runId: string, nativeNotificationHandled = false) => {
    if (completedRunIdRef.current === runId) return;
    completedRunIdRef.current = runId;
    setCountdown((current) => current.runId === runId ? completeWorkoutCountdown(current) : current);
    setCompletionMessage("Timer complete");
    void cancelScheduledNotification(runId);
    if (nativeNotificationHandled) return;
    void onPlayCompletionSound();
    if (isNativePluginAvailable("Haptics")) {
      void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    }
  }, [cancelScheduledNotification, onPlayCompletionSound]);

  useEffect(() => {
    const shouldTickStopwatch = open && stopwatch.status === "running";
    const shouldTickCountdown = countdown.status === "running";
    if (!shouldTickStopwatch && !shouldTickCountdown) return;
    const tick = () => {
      const currentTime = Date.now();
      setNowMs(currentTime);
      const active = countdownRef.current;
      if (!appInBackgroundRef.current && active.status === "running" && active.runId && getWorkoutCountdownRemainingMs(active, currentTime) <= 0) completeTimer(active.runId);
    };
    tick();
    const interval = window.setInterval(tick, shouldTickStopwatch ? 40 : 250);
    return () => window.clearInterval(interval);
  }, [countdown.status, completeTimer, open, stopwatch.status]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let disposed = false;
    let pauseHandle: { remove: () => Promise<void> } | undefined;
    let resumeHandle: { remove: () => Promise<void> } | undefined;

    void App.addListener("pause", () => {
      appInBackgroundRef.current = true;
      const active = countdownRef.current;
      if (active.status !== "running" || !active.runId || active.endsAtMs === null) return;
      void scheduleWorkoutClockNotification({ runId: active.runId, workoutId, endsAtMs: active.endsAtMs, soundEnabled: !mutedRef.current }).then((scheduled) => {
        if (!scheduled) return;
        if (disposed || !appInBackgroundRef.current || countdownRef.current.runId !== active.runId) {
          void cancelWorkoutClockNotification(active.runId!);
          return;
        }
        scheduledRunIdRef.current = active.runId;
      });
    }).then((handle) => { if (disposed) void handle.remove(); else pauseHandle = handle; });

    void App.addListener("resume", () => {
      appInBackgroundRef.current = false;
      const active = countdownRef.current;
      if (active.status !== "running" || !active.runId) return;
      const notificationHandled = scheduledRunIdRef.current === active.runId;
      void cancelScheduledNotification(active.runId);
      const currentTime = Date.now();
      setNowMs(currentTime);
      if (getWorkoutCountdownRemainingMs(active, currentTime) <= 0) completeTimer(active.runId, notificationHandled);
    }).then((handle) => { if (disposed) void handle.remove(); else resumeHandle = handle; });

    return () => {
      disposed = true;
      void pauseHandle?.remove();
      void resumeHandle?.remove();
    };
  }, [cancelScheduledNotification, completeTimer, workoutId]);

  useEffect(() => () => {
    const runId = countdownRef.current.runId;
    if (runId) void cancelWorkoutClockNotification(runId);
  }, []);

  const stopwatchElapsedMs = getWorkoutStopwatchElapsedMs(stopwatch, nowMs);
  const countdownRemainingMs = getWorkoutCountdownRemainingMs(countdown, nowMs);
  const anyRunning = stopwatch.status === "running" || countdown.status === "running";
  const configuredDurationSeconds = getWorkoutTimerDurationSeconds(hours, minutes, seconds);
  const timerSetupDisabled = countdown.status === "running" || countdown.status === "paused";
  const timerDisplayMs = countdown.status === "idle" ? configuredDurationSeconds * 1000 : countdownRemainingMs;

  function changeConfiguredDuration(nextHours: number, nextMinutes: number, nextSeconds: number) {
    const durationSeconds = getWorkoutTimerDurationSeconds(nextHours, nextMinutes, nextSeconds);
    if (countdown.runId) void cancelScheduledNotification(countdown.runId);
    setHours(nextHours);
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
    setCountdown(initialWorkoutCountdown(durationSeconds));
    setCompletionMessage("");
  }

  function setPreset(durationSeconds: number) {
    if (countdown.runId) void cancelScheduledNotification(countdown.runId);
    setHours(Math.floor(durationSeconds / 3600));
    setMinutes(Math.floor((durationSeconds % 3600) / 60));
    setSeconds(durationSeconds % 60);
    setCountdown(initialWorkoutCountdown(durationSeconds));
    setCompletionMessage("");
  }

  function startTimer() {
    if (configuredDurationSeconds <= 0) return;
    void onInitializeAudio();
    const currentTime = Date.now();
    const runId = crypto.randomUUID();
    completedRunIdRef.current = null;
    setNowMs(currentTime);
    setCountdown(startWorkoutCountdown(configuredDurationSeconds, currentTime, runId));
    setCompletionMessage("");
  }

  function pauseTimer() {
    const currentTime = Date.now();
    if (countdown.runId) void cancelScheduledNotification(countdown.runId);
    setNowMs(currentTime);
    setCountdown((current) => pauseWorkoutCountdown(current, currentTime));
  }

  function resumeTimer() {
    void onInitializeAudio();
    const currentTime = Date.now();
    setNowMs(currentTime);
    setCountdown((current) => resumeWorkoutCountdown(current, currentTime));
    setCompletionMessage("");
  }

  function resetTimer() {
    if (countdown.runId) void cancelScheduledNotification(countdown.runId);
    completedRunIdRef.current = null;
    setCountdown(initialWorkoutCountdown(configuredDurationSeconds));
    setCompletionMessage("");
  }

  function addTimerSeconds(addedSeconds: number) {
    const currentTime = Date.now();
    if (countdown.runId) void cancelScheduledNotification(countdown.runId);
    setNowMs(currentTime);
    setCountdown((current) => addWorkoutCountdownTime(current, addedSeconds, currentTime));
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className={cn("relative size-10", anyRunning && "bg-primary/10 text-primary")} aria-label="Open workout timer">
          <TimerReset className="size-4" aria-hidden="true" />
          {anyRunning ? <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>Workout clock</DrawerTitle>
          <DrawerDescription>A manual stopwatch and timer independent of your rest timer.</DrawerDescription>
        </DrawerHeader>
        <Tabs defaultValue="stopwatch" className="px-4 pb-4">
          <TabsList><TabsTrigger value="stopwatch">Stopwatch</TabsTrigger><TabsTrigger value="timer">Timer</TabsTrigger></TabsList>
          <TabsContent value="stopwatch" className="space-y-4">
            <p className="py-5 text-center text-5xl font-black tracking-tight tabular-nums">{formatWorkoutStopwatch(stopwatchElapsedMs)}</p>
            <div className="grid grid-cols-2 gap-2">
              {stopwatch.status === "running" ? (
                <Button type="button" variant="outline" aria-label="Pause stopwatch" onClick={() => { const currentTime = Date.now(); setNowMs(currentTime); setStopwatch((current) => pauseWorkoutStopwatch(current, currentTime)); }}>Pause</Button>
              ) : stopwatch.status === "paused" ? (
                <Button type="button" aria-label="Resume stopwatch" onClick={() => { const currentTime = Date.now(); setNowMs(currentTime); setStopwatch((current) => resumeWorkoutStopwatch(current, currentTime)); }}>Resume</Button>
              ) : (
                <Button type="button" aria-label="Start stopwatch" onClick={() => { const currentTime = Date.now(); setNowMs(currentTime); setStopwatch(startWorkoutStopwatch(currentTime)); }}>Start</Button>
              )}
              <Button type="button" variant="outline" aria-label="Reset stopwatch" onClick={() => { setStopwatch(INITIAL_WORKOUT_STOPWATCH); setNowMs(Date.now()); }}>Reset</Button>
            </div>
          </TabsContent>
          <TabsContent value="timer" className="space-y-4">
            {timerSetupDisabled ? (
              <>
                <div className="py-6 text-center">
                  <p className="text-5xl font-black tracking-tight tabular-nums">{formatWorkoutCountdown(timerDisplayMs)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {countdown.status === "running" ? <Button type="button" variant="outline" aria-label="Pause timer" onClick={pauseTimer}>Pause</Button> : <Button type="button" aria-label="Resume timer" onClick={resumeTimer}>Resume</Button>}
                  <Button type="button" variant="outline" aria-label="Reset timer" onClick={resetTimer}>Reset</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addTimerSeconds(30)}>+30s</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addTimerSeconds(60)}>+1m</Button>
                </div>
              </>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-xl" aria-label="Timer duration picker">
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-lg border border-border/70 bg-muted/70" aria-hidden="true" />
                  <div className="relative z-10 flex min-w-0">
                    <WorkoutTimeWheel label="Hours" maximum={23} value={hours} unit={(hour) => hour === 1 ? "hour" : "hours"} onChange={(hour) => changeConfiguredDuration(hour, minutes, seconds)} />
                    <WorkoutTimeWheel label="Minutes" maximum={59} value={minutes} unit={() => "min"} onChange={(minute) => changeConfiguredDuration(hours, minute, seconds)} />
                    <WorkoutTimeWheel label="Seconds" maximum={59} value={seconds} unit={() => "sec"} onChange={(second) => changeConfiguredDuration(hours, minutes, second)} />
                  </div>
                </div>
                {countdown.status === "completed" ? <p className="text-center text-sm font-semibold text-primary">Timer complete</p> : null}
                <div className="grid grid-cols-5 gap-1">
                  {TIMER_PRESETS.map((preset) => <Button key={preset} type="button" size="sm" variant="outline" className="h-8 px-1 text-xs" onClick={() => setPreset(preset)}>{preset < 60 ? `${preset}s` : `${preset / 60}m`}</Button>)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="button" aria-label="Start timer" disabled={configuredDurationSeconds <= 0} onClick={startTimer}>Start</Button>
                </div>
              </>
            )}
            <p className="sr-only" aria-live="polite">{completionMessage}</p>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
