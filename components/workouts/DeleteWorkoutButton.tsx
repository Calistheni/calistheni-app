"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type DeleteWorkoutButtonProps = {
  workoutId: number;
};

async function getErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "Unable to delete workout.";
  } catch {
    return "Unable to delete workout.";
  }
}

export function DeleteWorkoutButton({ workoutId }: DeleteWorkoutButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this workout?")) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/user/workouts/${workoutId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      toast.success("Workout deleted.");
      router.push("/workouts");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete workout."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "Deleting..." : "Delete Workout"}
    </Button>
  );
}
