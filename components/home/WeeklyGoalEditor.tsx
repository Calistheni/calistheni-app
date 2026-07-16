"use client";

import { useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type ApiResponse = {
  error?: string;
  weeklyWorkoutGoal?: number;
};

export function WeeklyGoalEditor({
  initialGoal,
  completedWorkouts,
}: {
  initialGoal: number;
  completedWorkouts: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [savedGoal, setSavedGoal] = useState(initialGoal);
  const [draftGoal, setDraftGoal] = useState(initialGoal);
  const [isSaving, setIsSaving] = useState(false);
  const progress = Math.min(100, Math.round((completedWorkouts / savedGoal) * 100));

  async function saveGoal() {
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyWorkoutGoal: draftGoal }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save your weekly goal.");
      }

      const nextGoal = payload.weeklyWorkoutGoal ?? draftGoal;
      setSavedGoal(nextGoal);
      setDraftGoal(nextGoal);
      setIsOpen(false);
      toast.success("Weekly goal saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save your weekly goal."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="border-t pt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Weekly goal</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {completedWorkouts} / {savedGoal} workouts
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Pencil className="size-4" /> Edit goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set your weekly goal</DialogTitle>
              <DialogDescription>
                Choose how many workouts you want to complete each week.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-4 gap-2 py-2 sm:grid-cols-7">
              {Array.from({ length: 7 }, (_, index) => index + 1).map(
                (goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={draftGoal === goal ? "default" : "outline"}
                    className="h-11 text-base"
                    aria-pressed={draftGoal === goal}
                    onClick={() => setDraftGoal(goal)}
                  >
                    {goal}
                  </Button>
                )
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" disabled={isSaving} onClick={saveGoal}>
                {isSaving ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : null}
                {isSaving ? "Saving…" : "Save goal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Progress value={progress} className="mt-4 h-2" />
      <p className="mt-2 text-xs text-muted-foreground">
        {completedWorkouts >= savedGoal
          ? "Goal reached — strong week."
          : `${savedGoal - completedWorkouts} workout${
              savedGoal - completedWorkouts === 1 ? "" : "s"
            } to go.`}
      </p>
    </div>
  );
}
