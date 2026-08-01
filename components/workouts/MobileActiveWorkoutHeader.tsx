import Link from "next/link";
import { House } from "lucide-react";
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
    <div className="sticky top-0 z-30 -mx-4 w-auto max-w-[calc(100%+2rem)] md:hidden [overflow-anchor:none]">
      <div className="bg-background/95 px-4 pt-[calc(env(safe-area-inset-top)+0.375rem)] pb-1.5 backdrop-blur">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[2.25rem_3.35rem_minmax(0,1fr)_3.25rem] gap-1 p-1.5">
            <Button
              asChild
              size="icon"
              variant="outline"
              className="size-9"
            >
              <Link href="/home" aria-label="Go to home">
                <House className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 min-w-0 px-1 text-[11px]"
              aria-label={`Rest sounds ${restMuted ? "muted" : "on"}`}
              onClick={onToggleRestSound}
            >
              Rest: {restMuted ? "Off" : "On"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 min-w-0 max-w-full px-1.5 text-xs min-[360px]:px-2 min-[360px]:text-sm"
              onClick={onAddExercise}
            >
              Add Exercise
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 min-w-0 px-1 text-[11px]"
              onClick={onFinish}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Finish"}
            </Button>
          </div>

          <div className="grid grid-cols-3 divide-x border-t bg-muted/30 text-center">
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-col gap-0 rounded-none px-1 py-1.5 font-normal"
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
            <div className="min-w-0 px-1 py-1.5">
              <p className="text-[10px] leading-tight text-muted-foreground">
                Volume
              </p>
              <p className="truncate text-sm font-semibold">{volume}</p>
            </div>
            <div className="min-w-0 px-1 py-1.5">
              <p className="text-[10px] leading-tight text-muted-foreground">
                Done sets
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {completedSetCount}
              </p>
            </div>
          </div>

          {activeRestTimer ? (
            <div className="border-t px-2 py-1.5 min-[390px]:flex min-[390px]:items-center min-[390px]:gap-1.5">
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2 min-[390px]:mb-0 min-[390px]:flex-1">
                <p className="min-w-0 truncate text-xs font-medium">
                  {activeRestTimer.exerciseName}
                </p>
                <p className="shrink-0 text-sm font-bold tabular-nums">
                  {activeRestTimer.remainingTime}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-1 min-[390px]:w-[10.5rem] min-[390px]:shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-1 text-[11px]"
                  onClick={() => onAddRestSeconds(30)}
                >
                  +30s
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-1 text-[11px]"
                  onClick={() => onAddRestSeconds(60)}
                >
                  +1m
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-1 text-[11px]"
                  onClick={onResetRestTimer}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-1 text-[11px]"
                  onClick={onSkipRestTimer}
                >
                  Skip
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
