"use client";

import Image from "next/image";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExerciseListItem } from "@/types/workout";
import { getExerciseRecordHref } from "@/lib/exercise-routes";

type ExerciseGridProps = {
  exercises: ExerciseListItem[];
  currentUserId?: string | null;
  customOnly?: boolean;
};

export function ExerciseGrid({
  exercises,
  currentUserId,
  customOnly = false,
}: ExerciseGridProps) {
  const router = useRouter();
  const [deleteCandidate, setDeleteCandidate] =
    useState<ExerciseListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteExercise() {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/user/exercises/${deleteCandidate.id}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ||
            "We couldn't delete this exercise. Please try again."
        );
      }
      toast.success("Custom exercise deleted.");
      setDeleteCandidate(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't delete this exercise. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (exercises.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {customOnly
              ? "You haven't created any custom exercises yet."
              : "No exercises matched your filters."}
          </p>
          <p>
            {customOnly
              ? "Create your first private exercise to use it in workouts and routines."
              : "Try a broader search or select another muscle group."}
          </p>
          {customOnly ? (
            <Button asChild className="mt-2">
              <Link href="/exercises/custom/new">Create Custom Exercise</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((exercise) => {
          const isOwnedCustom =
            exercise.createdByUserId !== null &&
            exercise.createdByUserId === currentUserId;
          return (
            <Card key={exercise.id} className="h-full overflow-hidden">
              <Link href={getExerciseRecordHref(exercise.slug)}>
                {exercise.thumbnailUrl ? (
                  <Image
                    src={exercise.thumbnailUrl}
                    alt=""
                    width={480}
                    height={270}
                    unoptimized
                    className="aspect-video w-full bg-muted object-cover transition hover:opacity-90"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-primary/5 transition hover:opacity-90">
                    <Image
                      src="/icons/icon.png"
                      alt=""
                      width={96}
                      height={96}
                      className="size-20 rounded-2xl object-contain shadow-sm sm:size-24"
                    />
                  </div>
                )}
              </Link>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{exercise.muscle}</Badge>
                    {exercise.createdByUserId ? (
                      <Badge variant="outline">Custom</Badge>
                    ) : null}
                  </div>
                  {isOwnedCustom ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Manage ${exercise.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/exercises/custom/${exercise.id}/edit`}>
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteCandidate(exercise)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                {exercise.secondaryMuscles.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Also trains {exercise.secondaryMuscles.join(", ")}
                  </p>
                ) : null}
                <Link
                  href={getExerciseRecordHref(exercise.slug)}
                  className="block font-semibold hover:underline"
                >
                  {exercise.name}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              Exercises already used in a workout, routine, or personal record
              are protected and cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteExercise();
              }}
            >
              {isDeleting ? "Deleting..." : "Delete exercise"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
