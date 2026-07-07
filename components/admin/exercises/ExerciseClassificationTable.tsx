"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExerciseTrackingType } from "@/types/workout";
export type AdminExerciseClassification = {
  id: string;
  name: string;
  muscle: string;
  thumbnailUrl: string | null;
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
};

type ExerciseClassificationTableProps = {
  exercises: AdminExerciseClassification[];
};

const TRACKING_TYPES: ExerciseTrackingType[] = [
  "BODYWEIGHT_REPS",
  "WEIGHTED_BODYWEIGHT",
  "EXTERNAL_WEIGHT",
  "DURATION",
];

const TRACKING_TYPE_LABELS: Record<ExerciseTrackingType, string> = {
  BODYWEIGHT_REPS: "Bodyweight reps",
  WEIGHTED_BODYWEIGHT: "Weighted bodyweight",
  EXTERNAL_WEIGHT: "External weight",
  DURATION: "Duration",
};

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "Unable to update exercise.";
  } catch {
    return "Unable to update exercise.";
  }
}

export function ExerciseClassificationTable({
  exercises,
}: ExerciseClassificationTableProps) {
  const [items, setItems] = useState(exercises);
  const [savingId, setSavingId] = useState<string | null>(null);

  function updateExercise(
    exerciseId: string,
    updates: Partial<AdminExerciseClassification>
  ) {
    setItems((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...updates } : exercise
      )
    );
  }

  async function saveExercise(exercise: AdminExerciseClassification) {
    setSavingId(exercise.id);

    try {
      const response = await fetch(`/api/admin/exercises/${exercise.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingType: exercise.trackingType,
          bodyweightLoadFactor:
            exercise.trackingType === "BODYWEIGHT_REPS"
              ? exercise.bodyweightLoadFactor
              : null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const updatedExercise =
        (await response.json()) as AdminExerciseClassification;
      updateExercise(updatedExercise.id, updatedExercise);
      toast.success("Exercise classification saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update exercise classification."
      );
    } finally {
      setSavingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No exercises match these filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exercise</TableHead>
              <TableHead>Muscle</TableHead>
              <TableHead>Tracking type</TableHead>
              <TableHead>Bodyweight load</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((exercise) => (
              <TableRow key={exercise.id}>
                <TableCell className="min-w-72">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-md border bg-muted shrink-0">
                      {exercise.thumbnailUrl ? (
                        <img
                          src={exercise.thumbnailUrl}
                          alt={exercise.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          No img
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="font-medium">{exercise.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {exercise.muscle}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{exercise.muscle}</Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={exercise.trackingType}
                    onValueChange={(value) =>
                      updateExercise(exercise.id, {
                        trackingType: value as ExerciseTrackingType,
                        bodyweightLoadFactor:
                          value === "BODYWEIGHT_REPS"
                            ? exercise.bodyweightLoadFactor ?? 1
                            : null,
                      })
                    }
                  >
                    <SelectTrigger
                      aria-label={`${exercise.name} tracking type`}
                      className="w-56"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRACKING_TYPES.map((trackingType) => (
                        <SelectItem key={trackingType} value={trackingType}>
                          {TRACKING_TYPE_LABELS[trackingType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {exercise.trackingType === "BODYWEIGHT_REPS" ? (
                    <Input
                      type="number"
                      min="0.01"
                      step="0.05"
                      aria-label={`${exercise.name} bodyweight load factor`}
                      value={exercise.bodyweightLoadFactor ?? ""}
                      onChange={(event) =>
                        updateExercise(exercise.id, {
                          bodyweightLoadFactor:
                            event.target.value.trim() === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                      className="w-32"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingId === exercise.id}
                    onClick={() => void saveExercise(exercise)}
                  >
                    {savingId === exercise.id ? "Saving..." : "Save"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
