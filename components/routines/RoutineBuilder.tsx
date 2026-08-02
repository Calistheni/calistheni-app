"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Layers2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRestDuration,
  getExerciseThumbnailSrc,
  getExerciseTrackingTypeLabel,
  getRestBadgeLabel,
  REST_SELECTOR_SECONDS,
} from "@/lib/exercise-display";
import type {
  RoutineDetail,
  RoutineExerciseInput,
  RoutineMutationPayload,
  RoutineSetInput,
  RoutineSupersetInput,
} from "@/types/routine";
import type { ExerciseListItem } from "@/types/workout";
import {
  createSupersetKey,
  getSupersetDisplayLabel,
  getSupersetMembershipSortableId,
  reorderSupersetMembershipIds,
  SUPERSET_COLOR_KEYS,
  SUPERSET_COLOR_STYLES,
} from "@/lib/workout-supersets";
import {
  SortableExerciseItem,
  SortableExerciseList,
} from "@/components/workouts/SortableExerciseList";
import {
  getTrackingTypeFieldConfig,
  sanitizeRoutineSetForTrackingType,
} from "@/lib/exercise-tracking-fields";

type RoutineBuilderProps = {
  exercises: ExerciseListItem[];
  initialRoutine?: RoutineDetail;
};

type LocalRoutineExercise = Omit<
  RoutineExerciseInput,
  "clientExerciseId" | "routineExerciseId"
> & {
  localId: string;
  persistedId: number | null;
  supersetKey: string | null;
  supersetPosition: number | null;
};

const EMPTY_SET: RoutineSetInput = {
  reps: null,
  weightKg: null,
  durationSec: null,
  distanceMeters: null,
  steps: null,
  floors: null,
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
    localId: routineExercise.clientExerciseId,
    persistedId: routineExercise.id,
    exerciseId: routineExercise.exercise.id,
    restSeconds: routineExercise.restSeconds,
    notes: routineExercise.notes,
    supersetKey: routineExercise.supersetKey,
    supersetPosition: routineExercise.supersetPosition,
    sets: routineExercise.sets.map((set) =>
      sanitizeRoutineSetForTrackingType(
        {
          reps: set.reps,
          weightKg: set.weightKg,
          durationSec: set.durationSec,
          distanceMeters: set.distanceMeters,
          steps: set.steps,
          floors: set.floors,
        },
        routineExercise.exercise.trackingType
      )
    ),
  }));
}

async function getApiError(response: Response) {
  try {
    const payload = (await response.json()) as { code?: string; error?: string };

    return {
      code: payload.code,
      message: payload.error || "We couldn't save this routine. Please try again.",
    };
  } catch {
    return { message: "We couldn't save this routine. Please try again." };
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
  const [supersets, setSupersets] = useState<RoutineSupersetInput[]>(
    initialRoutine?.supersets ?? []
  );
  const [isSupersetDialogOpen, setIsSupersetDialogOpen] = useState(false);
  const [isSupersetConfirmationOpen, setIsSupersetConfirmationOpen] = useState(false);
  const [supersetSelection, setSupersetSelection] = useState<string[]>([]);
  const [customRestExerciseIds, setCustomRestExerciseIds] = useState<string[]>(
    () =>
      buildInitialExercises(initialRoutine)
        .filter(
          (exercise) =>
            exercise.restSeconds === null ||
            !REST_SELECTOR_SECONDS.some(
              (presetSeconds) => presetSeconds === exercise.restSeconds
            )
        )
        .map((exercise) => exercise.localId)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingSuperset, setIsCreatingSuperset] = useState(false);
  const isCreatingSupersetRef = useRef(false);
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
        persistedId: null,
        exerciseId,
        restSeconds: 90,
        notes: null,
        supersetKey: null,
        supersetPosition: null,
        sets: [{ ...EMPTY_SET }],
      },
    ]);
  }

  function removeExercise(localId: string) {
    setSelectedExercises((current) => current.filter((item) => item.localId !== localId));
    setSupersets((current) =>
      current.flatMap((superset) => {
        const exerciseClientIds = superset.exerciseClientIds.filter(
          (id) => id !== localId
        );
        return exerciseClientIds.length >= 2
          ? [{ ...superset, exerciseClientIds }]
          : [];
      })
    );
    setCustomRestExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
  }

  function moveRoutineSupersetExercise(activeSortableId: string, overSortableId: string) {
    setSupersets((current) => current.map((superset) => {
      const activeId = superset.exerciseClientIds.find((localId) => getSupersetMembershipSortableId(superset.key, localId) === activeSortableId);
      const overId = superset.exerciseClientIds.find((localId) => getSupersetMembershipSortableId(superset.key, localId) === overSortableId);
      return activeId && overId
        ? { ...superset, exerciseClientIds: reorderSupersetMembershipIds(superset.exerciseClientIds, activeId, overId) }
        : superset;
    }));
  }

  function createRoutineSuperset() {
    if (isCreatingSupersetRef.current) return;
    if (supersetSelection.length < 2) {
      toast.error("Select at least two exercises.");
      return;
    }

    isCreatingSupersetRef.current = true;
    setIsCreatingSuperset(true);
    const key = createSupersetKey();
    setSupersets((current) => [
      ...current,
      {
        key,
        label: null,
        colorKey:
          SUPERSET_COLOR_KEYS[current.length % SUPERSET_COLOR_KEYS.length],
        restSeconds: 90,
        plannedRounds: Math.max(
          ...supersetSelection.map(
            (localId) =>
              selectedExercises.find((exercise) => exercise.localId === localId)
                ?.sets.length ?? 1
          )
        ),
        hardRoundLimit: null,
        exerciseClientIds: [...supersetSelection],
      },
    ]);
    setSupersetSelection([]);
    setIsSupersetDialogOpen(false);
    setIsSupersetConfirmationOpen(false);
    toast.success("Superset added to routine.");
    queueMicrotask(() => {
      isCreatingSupersetRef.current = false;
      setIsCreatingSuperset(false);
    });
  }

  function requestRoutineSupersetCreation() {
    if (supersetSelection.length < 2) {
      toast.error("Select at least two exercises.");
      return;
    }

    if (supersets.length === 0) {
      createRoutineSuperset();
      return;
    }

    setIsSupersetDialogOpen(false);
    setIsSupersetConfirmationOpen(true);
  }

  const nextSupersetLabel = getSupersetDisplayLabel({ label: null }, supersets.length);
  const previousSupersetLabel = supersets.length > 0
    ? getSupersetDisplayLabel(supersets[supersets.length - 1], supersets.length - 1)
    : null;

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

  function setExerciseRestMode(localId: string, value: string) {
    if (value === "custom") {
      setCustomRestExerciseIds((current) =>
        current.includes(localId) ? current : [...current, localId]
      );
      return;
    }

    setCustomRestExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
    updateExercise(localId, { restSeconds: Number(value) });
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

  function updateSetField(
    localId: string,
    setIndex: number,
    field: keyof RoutineSetInput,
    value: string
  ) {
    updateSet(localId, setIndex, field, value);
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
      supersets,
      exercises: selectedExercises.map(
        ({
          localId,
          persistedId,
          exerciseId,
          restSeconds,
          notes,
          sets,
        }) => ({
          clientExerciseId: localId,
          routineExerciseId: persistedId,
          exerciseId,
          restSeconds,
          notes,
          sets: sets.map((set) => {
            const trackingType =
              exercises.find((exercise) => exercise.id === exerciseId)
                ?.trackingType ?? "NOT_SELECTED";
            return sanitizeRoutineSetForTrackingType(set, trackingType);
          }),
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
        const apiError = await getApiError(response);
        if (apiError.code === "ROUTINE_LIMIT_REACHED") {
          toast.error(apiError.message, {
            action: { label: "Upgrade", onClick: () => router.push("/pro") },
          });
          return;
        }
        throw new Error(apiError.message);
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
    <>
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

        {selectedExercises.length >= 2 ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSupersetSelection([]);
                setIsSupersetDialogOpen(true);
              }}
              disabled={selectedExercises.length < 2}
            >
              <Layers2 />
              Create superset
            </Button>
          </div>
        ) : null}

        {selectedExercises.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No exercises selected yet. Add one from the picker.
            </CardContent>
          </Card>
        ) : (
          <SortableExerciseList
            ids={selectedExercises.flatMap((exercise) => {
              const superset = supersets.find((item) => item.exerciseClientIds.includes(exercise.localId));
              return superset ? [getSupersetMembershipSortableId(superset.key, exercise.localId)] : [];
            })}
            onMove={moveRoutineSupersetExercise}
          >
          {selectedExercises.map((selectedExercise) => {
            const exercise = exercises.find(
              (item) => item.id === selectedExercise.exerciseId
            );

            if (!exercise) {
              return null;
            }

            const restSeconds = selectedExercise.restSeconds;
            const isCustomRest =
              customRestExerciseIds.includes(selectedExercise.localId) ||
              restSeconds === null ||
              !REST_SELECTOR_SECONDS.some(
                (presetSeconds) => presetSeconds === restSeconds
              );
            const exerciseSupersets = supersets.filter(
              (item) =>
                item.exerciseClientIds.includes(selectedExercise.localId) ||
                item.key === selectedExercise.supersetKey
            );
            const superset = exerciseSupersets[0] ?? null;
            const fieldConfig = getTrackingTypeFieldConfig(
              exercise.trackingType
            );

            const card = (
              <Card
                key={selectedExercise.localId}
                className="relative overflow-hidden"
              >
                {superset ? (
                  <span
                    className={`absolute inset-y-0 left-0 w-1 ${
                      SUPERSET_COLOR_STYLES[superset.colorKey].accent
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Image
                        src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
                        alt=""
                        width={160}
                        height={128}
                        unoptimized
                        className="h-16 w-20 shrink-0 rounded-md bg-muted object-cover"
                      />
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{exercise.name}</h2>
                        <div className="flex min-w-0 flex-wrap gap-1">
                          <Badge variant="secondary">{exercise.muscle}</Badge>
                          <Badge variant="outline">
                            {getExerciseTrackingTypeLabel(exercise.trackingType)}
                          </Badge>
                          {restSeconds !== null && !superset ? (
                            <Badge variant="outline">
                              {getRestBadgeLabel(restSeconds)}
                            </Badge>
                          ) : null}
                          {exercise.createdByUserId ? (
                            <Badge variant="outline">Custom</Badge>
                          ) : null}
                          {exerciseSupersets.map((exerciseSuperset) => (
                            <Badge
                              key={exerciseSuperset.key}
                              variant="outline"
                              className={
                                SUPERSET_COLOR_STYLES[exerciseSuperset.colorKey].badge
                              }
                            >
                              <Layers2 />
                              {getSupersetDisplayLabel(
                                exerciseSuperset,
                                supersets.findIndex((item) => item.key === exerciseSuperset.key)
                              )}
                            </Badge>
                          ))}
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
                  <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <div className="flex flex-wrap items-end gap-2">
                      {superset ? (
                        <p className="text-xs text-muted-foreground">
                          Rest is controlled by {getSupersetDisplayLabel(
                            superset,
                            supersets.findIndex((item) => item.key === superset.key)
                          )}.
                        </p>
                      ) : (
                        <>
                      <div className="space-y-2">
                        <Label htmlFor={`routine-rest-${selectedExercise.localId}`}>
                          Rest
                        </Label>
                        <Select
                          value={isCustomRest ? "custom" : String(restSeconds)}
                          onValueChange={(value) =>
                            setExerciseRestMode(selectedExercise.localId, value)
                          }
                        >
                          <SelectTrigger
                            id={`routine-rest-${selectedExercise.localId}`}
                            aria-label={`${exercise.name} rest time`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REST_SELECTOR_SECONDS.map((presetSeconds) => (
                              <SelectItem
                                key={presetSeconds}
                                value={String(presetSeconds)}
                              >
                                {formatRestDuration(presetSeconds)}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {isCustomRest ? (
                        <div className="min-w-24 flex-1 space-y-2">
                          <Label
                            htmlFor={`routine-custom-rest-${selectedExercise.localId}`}
                          >
                            Seconds
                          </Label>
                          <Input
                            id={`routine-custom-rest-${selectedExercise.localId}`}
                            type="number"
                            min="0"
                            max="3600"
                            value={restSeconds ?? ""}
                            onChange={(event) =>
                              updateExercise(selectedExercise.localId, {
                                restSeconds: getNumberValue(event.target.value),
                              })
                            }
                          />
                        </div>
                      ) : null}
                        </>
                      )}
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
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
                    >
                      {fieldConfig.reps ? (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
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
                      {fieldConfig.weight ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.5"
                          placeholder={fieldConfig.weightLabel}
                          aria-label={`Set ${setIndex + 1} ${fieldConfig.weightLabel.toLowerCase()}`}
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
                      ) : null}
                      {fieldConfig.duration ? (
                        <Input
                          type="number"
                          inputMode="decimal"
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
                      ) : null}
                      {fieldConfig.distance ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          placeholder="Meters"
                          aria-label={`Set ${setIndex + 1} distance`}
                          value={set.distanceMeters ?? ""}
                          onChange={(event) =>
                            updateSetField(
                              selectedExercise.localId,
                              setIndex,
                              "distanceMeters",
                              event.target.value
                            )
                          }
                        />
                      ) : null}
                      {fieldConfig.steps ? (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          placeholder="Steps"
                          aria-label={`Set ${setIndex + 1} steps`}
                          value={set.steps ?? ""}
                          onChange={(event) =>
                            updateSetField(
                              selectedExercise.localId,
                              setIndex,
                              "steps",
                              event.target.value
                            )
                          }
                        />
                      ) : null}
                      {fieldConfig.floors ? (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          placeholder="Floors"
                          aria-label={`Set ${setIndex + 1} floors`}
                          value={set.floors ?? ""}
                          onChange={(event) =>
                            updateSetField(
                              selectedExercise.localId,
                              setIndex,
                              "floors",
                              event.target.value
                            )
                          }
                        />
                      ) : null}
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
            const primarySuperset = exerciseSupersets[0];
            return primarySuperset ? (
              <SortableExerciseItem
                key={selectedExercise.localId}
                id={getSupersetMembershipSortableId(primarySuperset.key, selectedExercise.localId)}
                label={`${exercise.name} in ${getSupersetDisplayLabel(primarySuperset, supersets.findIndex((item) => item.key === primarySuperset.key))}`}
              >
                {(dragHandle) => <div className="flex min-w-0 items-start gap-1"><div className="pt-3">{dragHandle}</div>{card}</div>}
              </SortableExerciseItem>
            ) : card;
          })
          }
          </SortableExerciseList>
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
              <Button asChild variant="outline" className="mb-2 w-full">
                <Link href="/exercises/custom/new">Create Custom Exercise</Link>
              </Button>
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
                      src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
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
                      {exercise.createdByUserId ? (
                        <Badge variant="outline" className="ml-2">
                          Custom
                        </Badge>
                      ) : null}
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
    <Dialog
      open={isSupersetDialogOpen}
      onOpenChange={setIsSupersetDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create superset</DialogTitle>
          <DialogDescription>
            Select at least two ungrouped exercises. The 90-second shared rest
            can be edited in the active workout.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
          {selectedExercises.map((selectedExercise) => {
            const exercise = exercises.find(
              (item) => item.id === selectedExercise.exerciseId
            );
            if (!exercise) return null;
            const usedInAnotherSuperset = supersets.some((superset) =>
              superset.exerciseClientIds.includes(selectedExercise.localId)
            );

            return (
              <div
                key={selectedExercise.localId}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Checkbox
                  id={`routine-superset-${selectedExercise.localId}`}
                  checked={supersetSelection.includes(selectedExercise.localId)}
                  onCheckedChange={(checked) =>
                    setSupersetSelection((current) =>
                      checked === true
                        ? [...current, selectedExercise.localId]
                        : current.filter(
                            (id) => id !== selectedExercise.localId
                          )
                    )
                  }
                />
                <Label
                  htmlFor={`routine-superset-${selectedExercise.localId}`}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate">{exercise.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {usedInAnotherSuperset
                      ? "Also in another superset"
                      : `${selectedExercise.sets.length} preset sets`}
                  </span>
                </Label>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSupersetDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={requestRoutineSupersetCreation}>
            Create superset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog
      open={isSupersetConfirmationOpen}
      onOpenChange={setIsSupersetConfirmationOpen}
    >
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Create {nextSupersetLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            These exercises will be added as a new superset group, separate from {previousSupersetLabel}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCreatingSuperset}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={createRoutineSuperset}
            disabled={isCreatingSuperset}
          >
            Create {nextSupersetLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
