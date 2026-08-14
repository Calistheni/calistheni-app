"use client";

import { Check, Loader2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localNutritionDateKey } from "@/lib/nutrition/date-navigation";
import {
  macroCalories,
  nutritionGoalFields,
  type NutritionGoalProgress,
  type NutritionGoalValues,
} from "@/lib/nutrition/goals";

type Goal = NutritionGoalValues & { effectiveFrom?: string };

function format(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function NutritionGoalCard({
  goal,
  currentGoal,
  isHistoricalDate,
  progress,
  onSaved,
}: {
  goal: Goal | null;
  currentGoal: Goal | null;
  isHistoricalDate: boolean;
  progress: NutritionGoalProgress | null;
  onSaved: (goal: Goal) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<keyof NutritionGoalValues, string>>(
    {
      caloriesKcal: "",
      proteinGrams: "",
      carbohydrateGrams: "",
      fatGrams: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function openEditor() {
    const editableGoal = currentGoal ?? goal;
    setDraft({
      caloriesKcal: editableGoal ? String(editableGoal.caloriesKcal) : "",
      proteinGrams: editableGoal ? String(editableGoal.proteinGrams) : "",
      carbohydrateGrams: editableGoal
        ? String(editableGoal.carbohydrateGrams)
        : "",
      fatGrams: editableGoal ? String(editableGoal.fatGrams) : "",
    });
    setErrors({});
    setOpen(true);
  }

  const macroKcal = useMemo(
    () =>
      macroCalories({
        caloriesKcal: Number(draft.caloriesKcal) || 0,
        proteinGrams: Number(draft.proteinGrams) || 0,
        carbohydrateGrams: Number(draft.carbohydrateGrams) || 0,
        fatGrams: Number(draft.fatGrams) || 0,
      }),
    [draft]
  );
  const calorieGoal = Number(draft.caloriesKcal) || 0;

  async function save() {
    if (saving) return;
    setSaving(true);
    setErrors({});
    try {
      const payload = {
        caloriesKcal: Number(draft.caloriesKcal),
        proteinGrams: Number(draft.proteinGrams),
        carbohydrateGrams: Number(draft.carbohydrateGrams),
        fatGrams: Number(draft.fatGrams),
        effectiveFrom: localNutritionDateKey(),
      };
      const response = await fetch("/api/user/nutrition/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrors(data.fieldErrors ?? {});
        throw new Error(data.error ?? "Unable to save nutrition goal.");
      }
      onSaved(data as Goal);
      setOpen(false);
      toast.success(
        currentGoal ?? goal ? "Nutrition goal updated." : "Nutrition goal set."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save nutrition goal."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Nutrition goal</p>
              {goal ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {format(goal.caloriesKcal, 0)} kcal · P{" "}
                  {format(goal.proteinGrams)} · C{" "}
                  {format(goal.carbohydrateGrams)} · F {format(goal.fatGrams)}
                </p>
              ) : isHistoricalDate ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  No nutrition goal was active on this date.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Set daily calorie and macro targets to track your progress.
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openEditor}
            >
              {currentGoal ?? goal ? <Pencil /> : null}
              {isHistoricalDate && currentGoal
                ? "Edit current goal"
                : currentGoal ?? goal
                ? "Edit goal"
                : "Set goal"}
            </Button>
          </div>
          {goal && progress?.complete ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
              <Check className="size-4" />
              Daily goal complete
            </p>
          ) : null}
          {goal && isHistoricalDate ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Goal active on this date
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentGoal ?? goal
                ? "Edit nutrition goal"
                : "Set nutrition goal"}
            </DialogTitle>
            <DialogDescription>
              All four targets are used to calculate daily completion.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {nutritionGoalFields.map(([key, label, unit]) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`nutrition-goal-${key}`}>{label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`nutrition-goal-${key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    className="text-base"
                    value={draft[key]}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={
                      errors[key] ? `nutrition-goal-${key}-error` : undefined
                    }
                  />
                  <span className="w-10 text-sm text-muted-foreground">
                    {unit}
                  </span>
                </div>
                {errors[key]?.[0] ? (
                  <p
                    id={`nutrition-goal-${key}-error`}
                    className="text-sm text-destructive"
                  >
                    {errors[key][0]}
                  </p>
                ) : null}
              </div>
            ))}
            {calorieGoal > 0 &&
            macroKcal > 0 &&
            Math.abs(macroKcal - calorieGoal) >= 1 ? (
              <p className="text-xs text-muted-foreground">
                Your macro targets account for approximately{" "}
                {format(macroKcal, 0)} kcal, which differs from your{" "}
                {format(calorieGoal, 0)} kcal calorie target.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}Save goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
