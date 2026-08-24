import Link from "next/link";
import { House, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

type MobileActiveWorkoutHeaderProps = {
  restMuted: boolean;
  duration: string;
  volume: string;
  completedSetCount: number;
  isSaving: boolean;
  activeRestTimer: {
    exerciseName: string;
    remainingTime: string;
  } | null;
  onToggleRestSound: () => void;
  onAddExercise: () => void;
  onFinish: () => void;
  onOpenTimerControls: () => void;
  onAddRestSeconds: (seconds: number) => void;
  onResetRestTimer: () => void;
  onSkipRestTimer: () => void;
};

export function MobileActiveWorkoutHeader({
  restMuted,
  duration,
  volume,
  completedSetCount,
  isSaving,
  activeRestTimer,
  onToggleRestSound,
  onAddExercise,
  onFinish,
  onOpenTimerControls,
  onAddRestSeconds,
  onResetRestTimer,
  onSkipRestTimer,
}: MobileActiveWorkoutHeaderProps) {
  return (
    <div className="active-workout-mobile-header sticky top-0 z-30 shrink-0 border-b bg-card/95 backdrop-blur md:hidden [overflow-anchor:none]">
      <div className="active-workout-mobile-header-inset grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_3.75rem] gap-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-1">
        <Button asChild size="icon" variant="ghost" className="size-10">
          <Link href="/home" aria-label="Go to home">
            <House className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label={restMuted ? "Enable rest timer sound" : "Mute rest timer sound"}
          onClick={onToggleRestSound}
        >
          {restMuted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-10 min-w-0 max-w-full px-1.5 text-xs min-[360px]:px-2 min-[360px]:text-sm"
          onClick={onAddExercise}
        >
          Add Exercise
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 min-w-0 px-1.5 text-xs min-[360px]:px-2 min-[360px]:text-sm"
          onClick={onFinish}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Finish"}
        </Button>
      </div>

      <div className="active-workout-mobile-header-inset grid grid-cols-3 border-t border-border/60 text-center">
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-w-0 flex-col gap-0 rounded-none px-1 py-1 font-normal"
          aria-label={`Workout duration ${duration}. Open timer controls.`}
          onClick={onOpenTimerControls}
        >
          <span className="text-[10px] leading-tight text-muted-foreground">
            Duration
          </span>
          <span className="max-w-full truncate text-sm font-semibold tabular-nums">
            {duration}
          </span>
        </Button>
        <div className="min-w-0 px-1 py-1">
          <p className="text-[10px] leading-tight text-muted-foreground">
            Volume
          </p>
          <p className="truncate text-sm font-semibold">{volume}</p>
        </div>
        <div className="min-w-0 px-1 py-1">
          <p className="text-[10px] leading-tight text-muted-foreground">
            Done sets
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {completedSetCount}
          </p>
        </div>
      </div>

      {activeRestTimer ? (
        <div className="active-workout-mobile-header-inset border-t py-1.5">
          <div className="mb-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <p className="min-w-0 truncate pb-0.5 text-xs font-medium text-muted-foreground">
              {activeRestTimer.exerciseName}
            </p>
            <p className="shrink-0 text-3xl leading-none font-black tracking-tight tabular-nums text-foreground">
              {activeRestTimer.remainingTime}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-1 text-xs"
              onClick={() => onAddRestSeconds(30)}
            >
              +30s
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-1 text-xs"
              onClick={() => onAddRestSeconds(60)}
            >
              +1m
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-1 text-xs"
              onClick={onResetRestTimer}
            >
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-1 text-xs"
              onClick={onSkipRestTimer}
            >
              Skip
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
