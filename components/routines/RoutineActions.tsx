"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type RoutineDeleteButtonProps = {
  routineId: number;
};

type SaveWorkoutAsRoutineButtonProps = {
  workoutId: number;
};

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

export function RoutineDeleteButton({ routineId }: RoutineDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteRoutine() {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/user/routines/${routineId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          code?: string;
          error?: string;
        };
        if (payload.code === "ROUTINE_LIMIT_REACHED") {
          toast.error(payload.error || "You've reached the Free routine limit.", {
            action: { label: "Upgrade", onClick: () => router.push("/pro") },
          });
          return;
        }
        throw new Error(payload.error || "Something went wrong. Please try again.");
      }

      toast.success("Routine deleted.");
      router.push("/routines");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't delete this routine. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Delete Routine"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the routine. Your completed workouts will
            not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep routine</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void deleteRoutine()}
          >
            Delete routine
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SaveWorkoutAsRoutineButton({
  workoutId,
}: SaveWorkoutAsRoutineButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function saveRoutine() {
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/routines/from-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workoutId }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const routine = (await response.json()) as { id: number };
      toast.success("Workout saved as routine.");
      router.push(`/routines/${routine.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't save this workout as a routine."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void saveRoutine()}
      disabled={isSaving}
    >
      {isSaving ? "Saving..." : "Save as Routine"}
    </Button>
  );
}
