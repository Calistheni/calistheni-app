"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkoutSetInput } from "@/types/workout";
import {
  getPerformanceReference,
  getPerformanceReferenceDescription,
  type ExercisePerformanceReference,
} from "@/lib/workout-performance-references";

export type SupersetRoundFormEntry = {
  localId: string;
  exerciseName: string;
  setIndex: number;
  setNumber: number;
  set: WorkoutSetInput;
  showWeight: boolean;
  weightedBodyweight: boolean;
  showReps: boolean;
  showDuration: boolean;
  showDistance: boolean;
  showSteps: boolean;
  showFloors: boolean;
  performanceReference?: ExercisePerformanceReference;
};

type SupersetRoundFormProps = {
  entries: SupersetRoundFormEntry[];
  rpeTrackingEnabled: boolean;
  rpeValues: number[];
  isSaving: boolean;
  onChange: (
    localId: string,
    field: keyof WorkoutSetInput,
    value: string
  ) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function SupersetRoundForm({
  entries,
  rpeTrackingEnabled,
  rpeValues,
  isSaving,
  onChange,
  onCancel,
  onSave,
}: SupersetRoundFormProps) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div
        data-slot="superset-round-scroll-area"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 pb-6 [-webkit-overflow-scrolling:touch]"
      >
        {entries.map((entry) => (
          <fieldset
            key={entry.localId}
            className="space-y-3 rounded-xl border p-3"
          >
            <legend className="px-1 font-semibold">{entry.exerciseName}</legend>
            <p className="text-xs text-muted-foreground">
              Set {entry.setNumber}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {entry.showWeight ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>
                    {entry.weightedBodyweight ? "Added weight" : "Weight"}
                  </span>
                  <div className="relative">
                    <Input
                      className="text-base"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      placeholder={getPerformanceReference(entry.performanceReference, "weight", entry.setIndex, entry.weightedBodyweight ? "+kg" : "Weight")}
                      aria-description={getPerformanceReferenceDescription(entry.performanceReference, "weight", entry.setIndex)}
                      value={entry.set.weight ?? ""}
                      onChange={(event) =>
                        onChange(entry.localId, "weight", event.target.value)
                      }
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      kg
                    </span>
                  </div>
                </label>
              ) : null}
              {entry.showReps ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Reps</span>
                  <Input
                    className="text-base"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    placeholder={getPerformanceReference(entry.performanceReference, "reps", entry.setIndex, "Reps")}
                    aria-description={getPerformanceReferenceDescription(entry.performanceReference, "reps", entry.setIndex)}
                    value={entry.set.reps ?? ""}
                    onChange={(event) =>
                      onChange(entry.localId, "reps", event.target.value)
                    }
                  />
                </label>
              ) : null}
              {entry.showDuration ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Duration</span>
                  <div className="relative">
                    <Input
                      className="text-base"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      placeholder={getPerformanceReference(entry.performanceReference, "durationSeconds", entry.setIndex, "Duration")}
                      aria-description={getPerformanceReferenceDescription(entry.performanceReference, "durationSeconds", entry.setIndex)}
                      value={entry.set.durationSeconds ?? ""}
                      onChange={(event) =>
                        onChange(
                          entry.localId,
                          "durationSeconds",
                          event.target.value
                        )
                      }
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      sec
                    </span>
                  </div>
                </label>
              ) : null}
              {entry.showDistance ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Distance</span>
                  <div className="relative">
                    <Input
                      className="text-base"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      placeholder={getPerformanceReference(entry.performanceReference, "distanceMeters", entry.setIndex, "Distance")}
                      aria-description={getPerformanceReferenceDescription(entry.performanceReference, "distanceMeters", entry.setIndex)}
                      value={entry.set.distanceMeters ?? ""}
                      onChange={(event) =>
                        onChange(
                          entry.localId,
                          "distanceMeters",
                          event.target.value
                        )
                      }
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      m
                    </span>
                  </div>
                </label>
              ) : null}
              {entry.showSteps ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Steps</span>
                  <Input
                    className="text-base"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder={getPerformanceReference(entry.performanceReference, "steps", entry.setIndex, "Steps")}
                    aria-description={getPerformanceReferenceDescription(entry.performanceReference, "steps", entry.setIndex)}
                    value={entry.set.steps ?? ""}
                    onChange={(event) =>
                      onChange(entry.localId, "steps", event.target.value)
                    }
                  />
                </label>
              ) : null}
              {entry.showFloors ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Floors</span>
                  <Input
                    className="text-base"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder={getPerformanceReference(entry.performanceReference, "floors", entry.setIndex, "Floors")}
                    aria-description={getPerformanceReferenceDescription(entry.performanceReference, "floors", entry.setIndex)}
                    value={entry.set.floors ?? ""}
                    onChange={(event) =>
                      onChange(entry.localId, "floors", event.target.value)
                    }
                  />
                </label>
              ) : null}
              {rpeTrackingEnabled ? (
                <label className="space-y-1.5 text-sm font-medium">
                  <span>RPE</span>
                  <Select
                    value={
                      entry.set.rpe === null ? "none" : String(entry.set.rpe)
                    }
                    onValueChange={(value) =>
                      onChange(
                        entry.localId,
                        "rpe",
                        value === "none" ? "" : value
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Optional</SelectItem>
                      {rpeValues.map((rpe) => (
                        <SelectItem key={rpe} value={String(rpe)}>
                          RPE {rpe}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="z-10 shrink-0 grid grid-cols-2 gap-2 border-t bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || entries.length === 0}>
          {isSaving ? "Saving..." : "Save round"}
        </Button>
      </div>
    </form>
  );
}
