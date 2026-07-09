"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RoutineDetail,
  RoutineExerciseInput,
  RoutineMutationPayload,
  RoutineSetInput,
} from "@/types/routine";
import type { ExerciseListItem } from "@/types/workout";

type RoutineBuilderProps = {
  exercises: ExerciseListItem[];
  initialRoutine?: RoutineDetail;
};

type LocalRoutineExercise = RoutineExerciseInput & {
  localId: string;
};

const EMPTY_SET: RoutineSetInput = {
  reps: null,
  weightKg: null,
  durationSec: null,
};

function getNumberValue(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function getTextValue(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function getDurationMinutesValue(durationSec: number | null) {
  return durationSec === null ? "" : durationSec / 60;
}

function buildInitialExercises(
  initialRoutine: RoutineDetail | undefined
): LocalRoutineExercise[] {
  if (!initialRoutine) {
    return [];
  }

  return initialRoutine.exercises.map((routineExercise) => ({
    localId: String(routineExercise.id),
    exerciseId: routineExercise.exercise.id,
    restSeconds: routineExercise.restSeconds,
    notes: routineExercise.notes,
    sets: routineExercise.sets.map((set) => ({
      reps: set.reps,
      weightKg: set.weightKg,
      durationSec: set.durationSec,
    })),
  }));
}

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "We couldn't save this routine. Please try again.";
  } catch {
    return "We couldn't save this routine. Please try again.";
  }
}

export function RoutineBuilder({
  exercises,
  initialRoutine,
}: RoutineBuilderProps) {
  const router = useRouter();
  const isEditing = Boolean(initialRoutine);
  const [name, setName] = useState(initialRoutine?.name ?? "");
  const [description, setDescription] = useState(
    initialRoutine?.description ?? ""
  );
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">(
    initialRoutine?.visibility ?? "PRIVATE"
  );
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [selectedExercises, setSelectedExercises] = useState<
    LocalRoutineExercise[]
  >(buildInitialExercises(initialRoutine));
  const [isSaving, setIsSaving] = useState(false);
  const muscles = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.muscle))].sort(),
    [exercises]
  );
  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return exercises
      .filter(
        (exercise) =>
          muscleFilter === "all" || exercise.muscle === muscleFilter
      )
      .filter(
        (exercise) =>
          !normalizedSearch ||
          exercise.name.toLowerCase().includes(normalizedSearch) ||
          exercise.muscle.toLowerCase().includes(normalizedSearch)
      )
      .slice(0, 40);
  }, [exercises, muscleFilter, search]);

  function addExercise(exerciseId: string) {
    if (selectedExercises.some((item) => item.exerciseId === exerciseId)) {
      return;
    }

    setSelectedExercises((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        exerciseId,
        restSeconds: 90,
        notes: null,
        sets: [{ ...EMPTY_SET }],
      },
    ]);
  }

  function removeExercise(localId: string) {
    setSelectedExercises((current) =>
      current.filter((item) => item.localId !== localId)
    );
  }

  function addSet(localId: string) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              sets: [...item.sets, { ...EMPTY_SET }],
            }
          : item
      )
    );
  }

  function removeSet(localId: string, setIndex: number) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              sets: item.sets.filter((_, index) => index !== setIndex),
            }
          : item
      )
    );
  }

  function updateExercise(
    localId: string,
    updates: Partial<LocalRoutineExercise>
  ) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, ...updates } : item
      )
    );
  }

  function updateSet(
    localId: string,
    setIndex: number,
    field: keyof RoutineSetInput,
    value: string
  ) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              sets: item.sets.map((set, index) =>
                index === setIndex
                  ? {
                      ...set,
                      [field]: getNumberValue(value),
                    }
                  : set
              ),
            }
          : item
      )
    );
  }

  function updateSetDurationMinutes(
    localId: string,
    setIndex: number,
    value: string
  ) {
    const minutes = getNumberValue(value);

    updateSet(
      localId,
      setIndex,
      "durationSec",
      minutes === null ? "" : String(Math.round(minutes * 60))
    );
  }

  async function saveRoutine() {
    if (!name.trim()) {
      toast.error("Routine name is required.");
      return;
    }

    if (selectedExercises.length === 0) {
      toast.error("Select at least one exercise.");
      return;
    }

    const payload: RoutineMutationPayload = {
      name: name.trim(),
      description: getTextValue(description),
      visibility,
      exercises: selectedExercises.map(
        ({ exerciseId, restSeconds, notes, sets }) => ({
          exerciseId,
          restSeconds,
          notes,
          sets,
        })
      ),
    };

    setIsSaving(true);

    try {
      const response = await fetch(
        isEditing ? `/api/user/routines/${initialRoutine?.id}` : "/api/user/routines",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const routine = (await response.json()) as RoutineDetail;
      toast.success(isEditing ? "Routine updated." : "Routine created.");
      router.push(`/routines/${routine.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't save this routine. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold">
              {isEditing ? "Edit Routine" : "New Routine"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Save a reusable plan and start future workouts faster.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="routine-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="routine-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Pull day"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="routine-description"
                className="text-sm font-medium"
              >
                Description
              </label>
              <Input
                id="routine-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="routine-visibility"
                className="text-sm font-medium"
              >
                Visibility
              </label>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(value as "PRIVATE" | "PUBLIC")
                }
              >
                <SelectTrigger id="routine-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {selectedExercises.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No exercises selected yet. Add one from the picker.
            </CardContent>
          </Card>
        ) : (
          selectedExercises.map((selectedExercise) => {
            const exercise = exercises.find(
              (item) => item.id === selectedExercise.exerciseId
            );

            if (!exercise) {
              return null;
            }

            return (
              <Card key={selectedExercise.localId}>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Image
                        src={exercise.thumbnailUrl ?? "/icon.svg"}
                        alt=""
                        width={160}
                        height={128}
                        unoptimized
                        className="h-16 w-20 rounded-md bg-muted object-cover"
                      />
                      <div>
                        <h2 className="font-semibold">{exercise.name}</h2>
                        <Badge variant="secondary">{exercise.muscle}</Badge>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeExercise(selectedExercise.localId)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Rest seconds
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="3600"
                        value={selectedExercise.restSeconds ?? ""}
                        onChange={(event) =>
                          updateExercise(selectedExercise.localId, {
                            restSeconds: getNumberValue(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Exercise notes
                      </label>
                      <Input
                        value={selectedExercise.notes ?? ""}
                        onChange={(event) =>
                          updateExercise(selectedExercise.localId, {
                            notes: getTextValue(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedExercise.sets.map((set, setIndex) => (
                    <div
                      key={setIndex}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <Input
                        type="number"
                        min="0"
                        placeholder="Reps"
                        aria-label={`Set ${setIndex + 1} reps`}
                        value={set.reps ?? ""}
                        onChange={(event) =>
                          updateSet(
                            selectedExercise.localId,
                            setIndex,
                            "reps",
                            event.target.value
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="Weight"
                        aria-label={`Set ${setIndex + 1} weight`}
                        value={set.weightKg ?? ""}
                        onChange={(event) =>
                          updateSet(
                            selectedExercise.localId,
                            setIndex,
                            "weightKg",
                            event.target.value
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.25"
                        placeholder="Minutes"
                        aria-label={`Set ${setIndex + 1} duration minutes`}
                        value={getDurationMinutesValue(set.durationSec)}
                        onChange={(event) =>
                          updateSetDurationMinutes(
                            selectedExercise.localId,
                            setIndex,
                            event.target.value
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          removeSet(selectedExercise.localId, setIndex)
                        }
                        disabled={selectedExercise.sets.length <= 1}
                      >
                        Remove Set
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => addSet(selectedExercise.localId)}
                  >
                    Add Set
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <aside className="space-y-4">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <h2 className="text-xl font-semibold">Exercise Picker</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search exercises"
              aria-label="Search exercises"
            />
            <Select value={muscleFilter} onValueChange={setMuscleFilter}>
              <SelectTrigger className="w-full" aria-label="Filter muscle">
                <SelectValue placeholder="All muscles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All muscles</SelectItem>
                {muscles.map((muscle) => (
                  <SelectItem key={muscle} value={muscle}>
                    {muscle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {filteredExercises.map((exercise) => {
                const selected = selectedExercises.some(
                  (item) => item.exerciseId === exercise.id
                );

                return (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => addExercise(exercise.id)}
                    disabled={selected}
                    className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Image
                      src={exercise.thumbnailUrl ?? "/icon.svg"}
                      alt=""
                      width={128}
                      height={112}
                      unoptimized
                      className="h-14 w-16 rounded-md bg-muted object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {exercise.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {exercise.muscle}
                      </span>
                    </span>
                    <Badge variant={selected ? "secondary" : "outline"}>
                      {selected ? "Added" : "Add"}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => void saveRoutine()}
              disabled={isSaving}
            >
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Update Routine"
                  : "Create Routine"}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
