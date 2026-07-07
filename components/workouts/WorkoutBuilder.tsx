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
import {
  formatElapsedTime,
  useWorkoutTimer,
} from "@/components/workouts/hooks/useWorkoutTimer";
import { useRestTimer } from "@/components/workouts/hooks/useRestTimer";
import { toast } from "sonner";
import { calculateWorkoutVolumeKg } from "@/lib/workout-volume";
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
  userBodyweightKg: number | null;
};

type LocalWorkoutExercise = WorkoutExerciseInput & {
  localId: string;
};

const DEFAULT_REST_SECONDS = 90;
const REST_PRESETS = [30, 60, 90, 120];

const TRACKING_TYPE_LABELS = {
  NOT_SELECTED: "Not selected",
  BODYWEIGHT_REPS: "Bodyweight reps",
  WEIGHTED_BODYWEIGHT: "Weighted bodyweight",
  EXTERNAL_WEIGHT: "External weight",
  DURATION: "Duration",
  DISTANCE_DURATION: "Distance + time",
  STEPS_DISTANCE_DURATION: "Steps + distance + time",
  FLOORS_DISTANCE_DURATION: "Floors + distance + time",
  WEIGHT_DISTANCE_DURATION: "Weight + distance + time",
} as const;

const EMPTY_SET: WorkoutSetInput = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  steps: null,
  floors: null,
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

function getDurationMinutesValue(durationSeconds: number | null) {
  return durationSeconds === null ? "" : durationSeconds / 60;
}

function formatRestOption(seconds: number) {
  return `${seconds} sec`;
}

function isRepsFieldVisible(trackingType: ExerciseListItem["trackingType"]) {
  return (
    trackingType === "NOT_SELECTED" ||
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT" ||
    trackingType === "EXTERNAL_WEIGHT"
  );
}

function isWeightFieldVisible(trackingType: ExerciseListItem["trackingType"]) {
  return (
    trackingType === "NOT_SELECTED" ||
    trackingType === "WEIGHTED_BODYWEIGHT" ||
    trackingType === "EXTERNAL_WEIGHT" ||
    trackingType === "WEIGHT_DISTANCE_DURATION"
  );
}

function isDurationFieldVisible(
  trackingType: ExerciseListItem["trackingType"]
) {
  return (
    trackingType === "NOT_SELECTED" ||
    trackingType === "DURATION" ||
    trackingType === "DISTANCE_DURATION" ||
    trackingType === "STEPS_DISTANCE_DURATION" ||
    trackingType === "FLOORS_DISTANCE_DURATION" ||
    trackingType === "WEIGHT_DISTANCE_DURATION"
  );
}

function isDistanceFieldVisible(
  trackingType: ExerciseListItem["trackingType"]
) {
  return (
    trackingType === "NOT_SELECTED" ||
    trackingType === "DISTANCE_DURATION" ||
    trackingType === "STEPS_DISTANCE_DURATION" ||
    trackingType === "FLOORS_DISTANCE_DURATION" ||
    trackingType === "WEIGHT_DISTANCE_DURATION"
  );
}

function usesBodyweightVolume(trackingType: ExerciseListItem["trackingType"]) {
  return (
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT"
  );
}

function formatVolumeKg(volumeKg: number) {
  return `${Math.round(volumeKg).toLocaleString()} kg`;
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
    restSeconds: workoutExercise.restSeconds ?? DEFAULT_REST_SECONDS,
    sets: workoutExercise.sets.map((set) => ({
      reps: set.reps,
      weight: set.weight,
      durationSeconds: set.durationSeconds,
      distanceMeters: set.distanceMeters,
      steps: set.steps,
      floors: set.floors,
      notes: set.notes,
      completed: set.completed,
    })),
  }));
}

export function WorkoutBuilder({
  exercises,
  initialWorkout,
  userBodyweightKg,
}: WorkoutBuilderProps) {
  const router = useRouter();
  const isEditing = Boolean(initialWorkout);
  const workoutTimer = useWorkoutTimer(
    `calistheni-workout-timer:${initialWorkout?.id ?? "new"}`
  );
  const restTimer = useRestTimer();
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
  const selectedExercisesWithMetadata = useMemo(
    () =>
      selectedExercises
        .map((selectedExercise) => {
          const exercise = exercises.find(
            (item) => item.id === selectedExercise.exerciseId
          );

          return exercise
            ? {
                selectedExercise,
                exercise,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            selectedExercise: LocalWorkoutExercise;
            exercise: ExerciseListItem;
          } => item !== null
        ),
    [exercises, selectedExercises]
  );
  const liveVolumeKg = useMemo(
    () =>
      calculateWorkoutVolumeKg({
        exercises: selectedExercisesWithMetadata.map(
          ({ selectedExercise, exercise }) => ({
            trackingType: exercise.trackingType,
            bodyweightLoadFactor: exercise.bodyweightLoadFactor,
            sets: selectedExercise.sets.map((set) => ({
              reps: set.reps,
              weightKg: set.weight,
            })),
          })
        ),
        userBodyweightKg,
      }),
    [selectedExercisesWithMetadata, userBodyweightKg]
  );
  const needsBodyweightForVolume =
    userBodyweightKg === null &&
    selectedExercisesWithMetadata.some(({ exercise }) =>
      usesBodyweightVolume(exercise.trackingType)
    );

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
        restSeconds: DEFAULT_REST_SECONDS,
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

  function updateExerciseRestSeconds(localId: string, restSeconds: number) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              restSeconds,
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

  function updateSetCompleted(
    localId: string,
    setIndex: number,
    completed: boolean,
    exerciseName: string,
    restSeconds: number | null
  ) {
    void restTimer.initializeAudio();
    updateSet(localId, setIndex, "completed", completed);

    if (completed) {
      restTimer.startRestTimer({
        exerciseLocalId: localId,
        exerciseName,
        restSeconds: restSeconds ?? DEFAULT_REST_SECONDS,
      });
    }
  }

  function startWorkout() {
    void restTimer.initializeAudio();
    workoutTimer.start();
  }

  function pauseWorkout() {
    void restTimer.initializeAudio();
    workoutTimer.pause();
  }

  function resumeWorkout() {
    void restTimer.initializeAudio();
    workoutTimer.resume();
  }

  function resetWorkoutTimer() {
    void restTimer.initializeAudio();
    workoutTimer.reset();
  }

  function addRestSeconds(seconds: number) {
    void restTimer.initializeAudio();
    restTimer.addSeconds(seconds);
  }

  function resetRestTimer() {
    void restTimer.initializeAudio();
    restTimer.resetRestTimer();
  }

  function skipRestTimer() {
    void restTimer.initializeAudio();
    restTimer.skipRestTimer();
  }

  function toggleRestSound() {
    if (restTimer.isMuted) {
      void restTimer.initializeAudio();
    }

    restTimer.toggleMuted();
  }

  async function testRestSound() {
    await restTimer.initializeAudio();
    await restTimer.testSound();
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
      "durationSeconds",
      minutes === null ? "" : String(Math.round(minutes * 60))
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
      exercises: selectedExercises.map(({ exerciseId, notes, restSeconds, sets }) => ({
        exerciseId,
        notes,
        restSeconds,
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
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Workout timer
                  </p>
                  <p className="text-3xl font-bold tabular-nums">
                    {workoutTimer.formattedElapsed}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workoutTimer.status === "idle" ? (
                    <Button type="button" onClick={startWorkout}>
                      Start Workout
                    </Button>
                  ) : null}
                  {workoutTimer.status === "running" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={pauseWorkout}
                    >
                      Pause
                    </Button>
                  ) : null}
                  {workoutTimer.status === "paused" ? (
                    <Button type="button" onClick={resumeWorkout}>
                      Resume
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetWorkoutTimer}
                  >
                    Reset
                  </Button>
                  {restTimer.showTestSoundButton ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void testRestSound()}
                    >
                      Test Sound
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            {restTimer.activeTimer ? (
              <div className="sticky top-3 z-20 rounded-lg border bg-card p-4 shadow-lg">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Rest timer
                    </p>
                    <p className="text-xl font-bold tabular-nums">
                      {restTimer.activeTimer.exerciseName} -{" "}
                      {formatElapsedTime(restTimer.remainingSeconds)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addRestSeconds(30)}
                    >
                      +30s
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addRestSeconds(60)}
                    >
                      +1m
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetRestTimer}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={skipRestTimer}
                    >
                      Skip
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={toggleRestSound}
                    >
                      {restTimer.isMuted ? "Unmute" : "Mute"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleRestSound}
                >
                  Rest sounds: {restTimer.isMuted ? "Muted" : "On"}
                </Button>
              </div>
            )}
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
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Total workout volume
                </p>
                <p className="text-2xl font-bold">
                  {liveVolumeKg === null
                    ? "Volume unavailable"
                    : formatVolumeKg(liveVolumeKg)}
                </p>
                {needsBodyweightForVolume ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Set your bodyweight in your profile to calculate
                    bodyweight exercise volume.
                  </p>
                ) : null}
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
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="secondary">{exercise.muscle}</Badge>
                          <Badge variant="outline">
                            {TRACKING_TYPE_LABELS[exercise.trackingType]}
                          </Badge>
                        </div>
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
                  <div className="grid gap-3 sm:grid-cols-[220px_160px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Rest preset
                      </label>
                      <Select
                        value={
                          REST_PRESETS.includes(
                            selectedExercise.restSeconds ??
                              DEFAULT_REST_SECONDS
                          )
                            ? String(
                                selectedExercise.restSeconds ??
                                  DEFAULT_REST_SECONDS
                              )
                            : "custom"
                        }
                        onValueChange={(value) => {
                          if (value !== "custom") {
                            updateExerciseRestSeconds(
                              selectedExercise.localId,
                              Number(value)
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          aria-label={`${exercise.name} rest preset`}
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REST_PRESETS.map((restSeconds) => (
                            <SelectItem
                              key={restSeconds}
                              value={String(restSeconds)}
                            >
                              {formatRestOption(restSeconds)}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Custom rest
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="3600"
                        step="5"
                        aria-label={`${exercise.name} rest seconds`}
                        value={
                          selectedExercise.restSeconds ??
                          DEFAULT_REST_SECONDS
                        }
                        onChange={(event) =>
                          updateExerciseRestSeconds(
                            selectedExercise.localId,
                            Math.max(0, Number(event.target.value) || 0)
                          )
                        }
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {selectedExercise.sets.map((set, setIndex) => (
                      <div
                        key={setIndex}
                        className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5"
                      >
	                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
	                          <Checkbox
	                            checked={set.completed}
	                            onCheckedChange={(checked) =>
	                              updateSetCompleted(
	                                selectedExercise.localId,
	                                setIndex,
	                                checked === true,
                                  exercise.name,
                                  selectedExercise.restSeconds
	                              )
	                            }
	                          />
	                          Done
	                        </label>
                        {isRepsFieldVisible(exercise.trackingType) ? (
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
                        ) : null}
                        {isWeightFieldVisible(exercise.trackingType) ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder={
                            exercise.trackingType === "WEIGHTED_BODYWEIGHT"
                              ? "Added weight"
                              : "Weight"
                          }
                          aria-label={
                            exercise.trackingType === "WEIGHTED_BODYWEIGHT"
                              ? `Set ${setIndex + 1} added weight`
                              : `Set ${setIndex + 1} weight`
                          }
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
                        ) : null}
                        {isDurationFieldVisible(exercise.trackingType) ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.25"
                          placeholder="Minutes"
                          aria-label={`Set ${setIndex + 1} duration minutes`}
                          value={getDurationMinutesValue(
                            set.durationSeconds
                          )}
                          onChange={(event) =>
                            updateSetDurationMinutes(
                              selectedExercise.localId,
                              setIndex,
                              event.target.value
                            )
                          }
                        />
                        ) : null}
                        {isDistanceFieldVisible(exercise.trackingType) ? (
                          <Input
                            type="number"
                            min="0"
                            step="1"
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
                        ) : null}
                        {exercise.trackingType ===
                        "STEPS_DISTANCE_DURATION" ? (
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Steps"
                            aria-label={`Set ${setIndex + 1} steps`}
                            value={set.steps ?? ""}
                            onChange={(event) =>
                              updateSet(
                                selectedExercise.localId,
                                setIndex,
                                "steps",
                                event.target.value
                              )
                            }
                          />
                        ) : null}
                        {exercise.trackingType ===
                        "FLOORS_DISTANCE_DURATION" ? (
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Floors"
                            aria-label={`Set ${setIndex + 1} floors`}
                            value={set.floors ?? ""}
                            onChange={(event) =>
                              updateSet(
                                selectedExercise.localId,
                                setIndex,
                                "floors",
                                event.target.value
                              )
                            }
                          />
                        ) : null}
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
