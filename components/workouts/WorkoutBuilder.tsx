"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type {
  ExerciseListItem,
  WorkoutDetail,
  WorkoutExerciseInput,
  WorkoutMutationPayload,
  WorkoutSetInput,
} from "@/types/workout";

type WorkoutBuilderProps = {
  exercises: ExerciseListItem[];
  initialWorkout?: WorkoutDetail;
};

type LocalWorkoutExercise = WorkoutExerciseInput & {
  localId: string;
};

const EMPTY_SET: WorkoutSetInput = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  notes: null,
  completed: false,
};

function getNumberValue(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function getTextValue(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "Unable to save workout.";
  } catch {
    return "Unable to save workout.";
  }
}

function buildInitialExercises(
  initialWorkout: WorkoutDetail | undefined
): LocalWorkoutExercise[] {
  if (!initialWorkout) {
    return [];
  }

  return initialWorkout.exercises.map((workoutExercise) => ({
    localId: String(workoutExercise.id),
    exerciseId: workoutExercise.exercise.id,
    notes: workoutExercise.notes,
    sets: workoutExercise.sets.map((set) => ({
      reps: set.reps,
      weight: set.weight,
      durationSeconds: set.durationSeconds,
      distanceMeters: set.distanceMeters,
      notes: set.notes,
      completed: set.completed,
    })),
  }));
}

export function WorkoutBuilder({
  exercises,
  initialWorkout,
}: WorkoutBuilderProps) {
  const router = useRouter();
  const isEditing = Boolean(initialWorkout);
  const [title, setTitle] = useState(initialWorkout?.title ?? "");
  const [notes, setNotes] = useState(initialWorkout?.notes ?? "");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">(
    initialWorkout?.visibility ?? "PUBLIC"
  );
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [selectedExercises, setSelectedExercises] = useState<
    LocalWorkoutExercise[]
  >(buildInitialExercises(initialWorkout));
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

  function updateSet(
    localId: string,
    setIndex: number,
    field: keyof WorkoutSetInput,
    value: string | boolean
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
	                      [field]:
	                        field === "completed"
	                          ? Boolean(value)
	                        : field === "notes"
	                          ? getTextValue(String(value))
	                          : getNumberValue(String(value)),
	                    }
                  : set
              ),
            }
          : item
      )
    );
  }

  async function saveWorkout() {
    if (selectedExercises.length === 0) {
      toast.error("Select at least one exercise.");
      return;
    }

    if (selectedExercises.some((exercise) => exercise.sets.length === 0)) {
      toast.error("Each exercise needs at least one set.");
      return;
    }

    const payload: WorkoutMutationPayload = {
      title: getTextValue(title),
      notes: getTextValue(notes),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      visibility,
      exercises: selectedExercises.map(({ exerciseId, notes, sets }) => ({
        exerciseId,
        notes,
        sets,
      })),
    };

    setIsSaving(true);

    try {
      const response = await fetch(
	        isEditing
	          ? `/api/user/workouts/${initialWorkout?.id}`
	          : "/api/user/workouts",
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

      const workout = (await response.json()) as { id: number };
      toast.success(isEditing ? "Workout updated." : "Workout saved.");
      router.push(`/workouts/${workout.id}`);
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to save workout."));
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
	              {isEditing ? "Edit Workout" : "New Workout"}
	            </h1>
	            <p className="text-sm text-muted-foreground">
	              Pick exercises, complete sets, and save the session to your
	              history.
	            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="workout-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="workout-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Morning pull session"
              />
            </div>
	            <div className="space-y-2">
	              <label htmlFor="workout-notes" className="text-sm font-medium">
                Notes
              </label>
              <Input
                id="workout-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
	                placeholder="How did it feel?"
	              />
	            </div>
	            <div className="space-y-2">
	              <label
	                htmlFor="workout-visibility"
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
	                <SelectTrigger id="workout-visibility" className="w-full">
	                  <SelectValue />
	                </SelectTrigger>
	                <SelectContent>
	                  <SelectItem value="PUBLIC">Public</SelectItem>
	                  <SelectItem value="PRIVATE">Private</SelectItem>
	                </SelectContent>
	              </Select>
	              <p className="text-xs text-muted-foreground">
	                Public workouts can appear on follower feeds and your public
	                profile.
	              </p>
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
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {selectedExercise.sets.map((set, setIndex) => (
                      <div
                        key={setIndex}
                        className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6"
                      >
	                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
	                          <Checkbox
	                            checked={set.completed}
	                            onCheckedChange={(checked) =>
	                              updateSet(
	                                selectedExercise.localId,
	                                setIndex,
	                                "completed",
	                                checked === true
	                              )
	                            }
	                          />
	                          Done
	                        </label>
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
                          value={set.weight ?? ""}
                          onChange={(event) =>
                            updateSet(
                              selectedExercise.localId,
                              setIndex,
                              "weight",
                              event.target.value
                            )
                          }
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder="Seconds"
                          aria-label={`Set ${setIndex + 1} duration seconds`}
                          value={set.durationSeconds ?? ""}
                          onChange={(event) =>
                            updateSet(
                              selectedExercise.localId,
                              setIndex,
                              "durationSeconds",
                              event.target.value
                            )
                          }
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="Meters"
                          aria-label={`Set ${setIndex + 1} distance meters`}
                          value={set.distanceMeters ?? ""}
                          onChange={(event) =>
                            updateSet(
                              selectedExercise.localId,
                              setIndex,
                              "distanceMeters",
                              event.target.value
                            )
                          }
                        />
                        <Input
                          placeholder="Notes"
                          aria-label={`Set ${setIndex + 1} notes`}
                          value={set.notes ?? ""}
                          onChange={(event) =>
                            updateSet(
                              selectedExercise.localId,
                              setIndex,
                              "notes",
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
                  </div>
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
            <p className="text-sm text-muted-foreground">
              Search by exercise or muscle.
            </p>
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
                      loading="lazy"
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
              onClick={() => void saveWorkout()}
              disabled={isSaving}
            >
	              {isSaving
	                ? "Saving..."
	                : isEditing
	                  ? "Update Workout"
	                  : "Save Workout"}
	            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
