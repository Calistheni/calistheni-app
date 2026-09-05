"use client";

import { Haptics } from "@capacitor/haptics";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent, type WheelEvent } from "react";
import { isNativePluginAvailable } from "@/lib/native/platform";
import {
  getWorkoutClockWheelIndex,
  shouldEmitWorkoutClockSelectionHaptic,
  WORKOUT_CLOCK_WHEEL_ROW_HEIGHT,
} from "@/lib/workout-clock-wheel";
import { cn } from "@/lib/utils";

type WorkoutTimeWheelProps = {
  label: string;
  maximum: number;
  value: number;
  unit: (value: number) => string;
  onChange: (value: number) => void;
};

const WHEEL_HEIGHT = 220;
const WHEEL_PADDING = (WHEEL_HEIGHT - WORKOUT_CLOCK_WHEEL_ROW_HEIGHT) / 2;
const SETTLE_DELAY_MS = 120;

export function WorkoutTimeWheel({ label, maximum, value, unit, onChange }: WorkoutTimeWheelProps) {
  const values = useMemo(() => Array.from({ length: maximum + 1 }, (_, index) => index), [maximum]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const selectionSessionRef = useRef(false);
  const lastSelectedRef = useRef(value);
  const settleTimerRef = useRef<number | null>(null);
  const [centeredValue, setCenteredValue] = useState(value);

  const beginSelection = useCallback(() => {
    interactionRef.current = true;
    if (selectionSessionRef.current || !isNativePluginAvailable("Haptics")) return;
    selectionSessionRef.current = true;
    void Haptics.selectionStart().catch(() => {
      selectionSessionRef.current = false;
    });
  }, []);

  const finishSelection = useCallback(() => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    interactionRef.current = false;
    if (!selectionSessionRef.current) return;
    selectionSessionRef.current = false;
    void Haptics.selectionEnd().catch(() => undefined);
  }, []);

  const scheduleSelectionEnd = useCallback(() => {
    if (pointerActiveRef.current) return;
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(finishSelection, SETTLE_DELAY_MS);
  }, [finishSelection]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || interactionRef.current) return;
    const targetTop = value * WORKOUT_CLOCK_WHEEL_ROW_HEIGHT;
    if (Math.abs(viewport.scrollTop - targetTop) > 0.5) viewport.scrollTop = targetTop;
    lastSelectedRef.current = value;
    setCenteredValue(value);
  }, [value]);

  useLayoutEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    if (selectionSessionRef.current) void Haptics.selectionEnd().catch(() => undefined);
  }, []);

  function updateSelection(scrollTop: number) {
    const nextValue = getWorkoutClockWheelIndex(scrollTop, maximum);
    if (nextValue === lastSelectedRef.current) return;
    const previousValue = lastSelectedRef.current;
    lastSelectedRef.current = nextValue;
    setCenteredValue(nextValue);
    onChange(nextValue);
    if (shouldEmitWorkoutClockSelectionHaptic(previousValue, nextValue, interactionRef.current) && selectionSessionRef.current) {
      void Haptics.selectionChanged().catch(() => undefined);
    }
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    updateSelection(event.currentTarget.scrollTop);
    if (interactionRef.current) scheduleSelectionEnd();
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY === 0) return;
    beginSelection();
    scheduleSelectionEnd();
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    let nextValue = centeredValue;
    if (event.key === "ArrowUp") nextValue -= 1;
    else if (event.key === "ArrowDown") nextValue += 1;
    else if (event.key === "PageUp") nextValue -= 5;
    else if (event.key === "PageDown") nextValue += 5;
    else if (event.key === "Home") nextValue = 0;
    else if (event.key === "End") nextValue = maximum;
    else return;
    event.preventDefault();
    nextValue = Math.min(maximum, Math.max(0, nextValue));
    if (nextValue === centeredValue) return;
    beginSelection();
    viewportRef.current?.scrollTo({ top: nextValue * WORKOUT_CLOCK_WHEEL_ROW_HEIGHT, behavior: "smooth" });
    scheduleSelectionEnd();
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={viewportRef}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={maximum}
        aria-valuenow={centeredValue}
        aria-valuetext={`${centeredValue} ${unit(centeredValue)}`}
        data-vaul-no-drag="true"
        className="app-scrollbar-hidden h-[220px] touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain select-none [-webkit-overflow-scrolling:touch] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ paddingBlock: WHEEL_PADDING }}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onPointerDown={() => { pointerActiveRef.current = true; beginSelection(); }}
        onPointerUp={() => { pointerActiveRef.current = false; scheduleSelectionEnd(); }}
        onPointerCancel={() => { pointerActiveRef.current = false; scheduleSelectionEnd(); }}
        onKeyDown={selectFromKeyboard}
      >
        {values.map((option) => {
          const distance = Math.abs(option - centeredValue);
          return (
            <div
              key={option}
              aria-hidden="true"
              className={cn(
                "flex h-11 snap-center items-center justify-center whitespace-nowrap text-center tabular-nums transition-[opacity,transform] duration-100",
                distance === 0 && "scale-100 text-xl font-semibold text-foreground opacity-100",
                distance === 1 && "scale-[0.96] text-lg text-muted-foreground opacity-55",
                distance > 1 && "scale-[0.92] text-base text-muted-foreground opacity-20",
              )}
            >
              <span>{option}</span>
              <span className="ml-1 text-sm font-medium">{unit(option)}</span>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-background via-background/85 to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background via-background/85 to-transparent" aria-hidden="true" />
    </div>
  );
}
