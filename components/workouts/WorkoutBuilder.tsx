"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  EllipsisVertical,
  Gauge,
  MessageSquare,
  Plus,
  TimerIcon,
  Trash2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  formatElapsedTime,
  useWorkoutTimer,
} from "@/components/workouts/hooks/useWorkoutTimer";
import { useRestTimer } from "@/components/workouts/hooks/useRestTimer";
import { toast } from "sonner";
import {
  clearActiveWorkoutSessionStorage,
  getOrCreateActiveWorkoutSessionId,
  getWorkoutDraftStorageKey,
  getWorkoutTimerStorageKey,
} from "@/lib/active-workout-session";
import {
  formatRestDuration,
  getExerciseThumbnailSrc,
  getExerciseTrackingTypeLabel,
  getRestBadgeLabel,
  REST_SELECTOR_SECONDS,
} from "@/lib/exercise-display";
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
  rpeTrackingEnabled: boolean;
  saveMode?: "create" | "edit";
};

type LocalWorkoutExercise = WorkoutExerciseInput & {
  localId: string;
};

type ActiveWorkoutDraft = {
  title: string;
  notes: string;
  visibility: "PRIVATE" | "PUBLIC";
  selectedExercises: LocalWorkoutExercise[];
};

const DEFAULT_REST_SECONDS = 90;
const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const COMPACT_WORKOUT_NUMBER_INPUT_CLASS =
  "h-9 min-w-0 rounded-md bg-background/80 px-1.5 text-center font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const EMPTY_SET: WorkoutSetInput = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  steps: null,
  floors: null,
  rpe: null,
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

function getSetRowGridClass(showRpeAction: boolean) {
  return showRpeAction
    ? "grid-cols-[1.25rem_minmax(0,1fr)_auto_auto_auto]"
    : "grid-cols-[1.25rem_minmax(0,1fr)_auto_auto]";
}

function getSetFieldsGridClass(
  trackingType: ExerciseListItem["trackingType"]
) {
  if (trackingType === "BODYWEIGHT_REPS" || trackingType === "DURATION") {
    return "grid-cols-1";
  }

  if (
    trackingType === "WEIGHTED_BODYWEIGHT" ||
    trackingType === "EXTERNAL_WEIGHT"
  ) {
    return "grid-cols-2";
  }

  return "grid-cols-[repeat(auto-fit,minmax(3rem,1fr))]";
}

function formatVolumeKg(volumeKg: number) {
  return `${Math.round(volumeKg).toLocaleString()} kg`;
}

function readActiveWorkoutDraft(sessionId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(getWorkoutDraftStorageKey(sessionId));

    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<ActiveWorkoutDraft>;

    if (!Array.isArray(parsed.selectedExercises)) {
      return null;
    }

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      visibility:
        parsed.visibility === "PRIVATE" || parsed.visibility === "PUBLIC"
          ? parsed.visibility
          : "PUBLIC",
      selectedExercises: parsed.selectedExercises,
    } satisfies ActiveWorkoutDraft;
  } catch {
    return null;
  }
}

function getRpeDescription(rpe: number) {
  const descriptions: Record<number, string> = {
    6: "Moderate effort - 4+ reps remaining",
    7: "Vigorous effort - about 3 reps remaining",
    7.5: "Vigorous effort - maybe 3 reps remaining",
    8: "Very hard effort - about 2 reps remaining",
    8.5: "Very hard effort - maybe 2 reps remaining",
    9: "Extremely hard effort - about 1 rep remaining",
    9.5: "Extremely hard effort - maybe 1 rep remaining",
    10: "Max effort - no more reps possible",
  };

  return descriptions[rpe] ?? "";
}

function formatSetSummary(
  set: WorkoutSetInput,
  trackingType: ExerciseListItem["trackingType"]
) {
  const parts: string[] = [];

  if (isWeightFieldVisible(trackingType) && set.weight !== null) {
    parts.push(
      trackingType === "WEIGHTED_BODYWEIGHT"
        ? `+${set.weight} kg`
        : `${set.weight} kg`
    );
  }

  if (isRepsFieldVisible(trackingType) && set.reps !== null) {
    parts.push(`${set.reps} reps`);
  }

  if (isDurationFieldVisible(trackingType) && set.durationSeconds !== null) {
    parts.push(formatElapsedTime(set.durationSeconds));
  }

  if (set.distanceMeters !== null) {
    parts.push(`${set.distanceMeters} m`);
  }

  return parts.length ? parts.join(" x ") : "Set details";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function getApiErrorMessage(
  response: Response,
  fallback = "We couldn't save your workout. Please try again."
) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || fallback;
  } catch {
    return fallback;
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
      rpe: set.rpe,
      notes: set.notes,
      completed: set.completed,
    })),
  }));
}

export function WorkoutBuilder({
  exercises,
  initialWorkout,
  userBodyweightKg,
  rpeTrackingEnabled,
  saveMode,
}: WorkoutBuilderProps) {
  const router = useRouter();
  const isEditing = saveMode ? saveMode === "edit" : Boolean(initialWorkout);
  const [activeWorkoutSessionId, setActiveWorkoutSessionId] = useState(
    isEditing && initialWorkout?.id
      ? `edit-${initialWorkout.id}`
      : "server-active-workout"
  );
  const [isActiveWorkoutSessionReady, setIsActiveWorkoutSessionReady] =
    useState(isEditing);
  const initialSelectedExercises = buildInitialExercises(initialWorkout);
  const workoutTimer = useWorkoutTimer(
    getWorkoutTimerStorageKey(activeWorkoutSessionId),
    !isEditing && isActiveWorkoutSessionReady
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
  >(initialSelectedExercises);
  const [openExerciseIds, setOpenExerciseIds] = useState<string[]>(() =>
    initialSelectedExercises[0] ? [initialSelectedExercises[0].localId] : []
  );
  const [customRestExerciseIds, setCustomRestExerciseIds] = useState<string[]>(
    () =>
      initialSelectedExercises
        .filter(
          (exercise) =>
            exercise.restSeconds !== null &&
            !REST_SELECTOR_SECONDS.some(
              (presetSeconds) => presetSeconds === exercise.restSeconds
            )
        )
        .map((exercise) => exercise.localId)
  );
  const [currentUserBodyweightKg, setCurrentUserBodyweightKg] = useState(
    userBodyweightKg
  );
  const [bodyweightInput, setBodyweightInput] = useState(
    userBodyweightKg?.toString() ?? ""
  );
  const [isBodyweightDialogOpen, setIsBodyweightDialogOpen] = useState(false);
  const [isSavingBodyweight, setIsSavingBodyweight] = useState(false);
  const [exercisePendingRemoval, setExercisePendingRemoval] = useState<{
    localId: string;
    exerciseName: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isWorkoutDetailsOpen, setIsWorkoutDetailsOpen] = useState(false);
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);
  const [isTimerSheetOpen, setIsTimerSheetOpen] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [activeRpeTarget, setActiveRpeTarget] = useState<{
    localId: string;
    setIndex: number;
    exerciseName: string;
    summary: string;
    value: number | null;
  } | null>(null);
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
        userBodyweightKg: currentUserBodyweightKg,
      }),
    [currentUserBodyweightKg, selectedExercisesWithMetadata]
  );
  const needsBodyweightForVolume =
    currentUserBodyweightKg === null &&
    selectedExercisesWithMetadata.some(({ exercise }) =>
      usesBodyweightVolume(exercise.trackingType)
    );
  const completedSetCount = selectedExercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => set.completed).length,
    0
  );

  useEffect(() => {
    if (isEditing) {
      return;
    }

    const restoreActiveWorkout = window.setTimeout(() => {
      const sessionId = getOrCreateActiveWorkoutSessionId();
      const draft = readActiveWorkoutDraft(sessionId);

      setActiveWorkoutSessionId(sessionId);

      if (draft) {
        setTitle(draft.title);
        setNotes(draft.notes);
        setVisibility(draft.visibility);
        setSelectedExercises(draft.selectedExercises);
        setOpenExerciseIds(
          draft.selectedExercises[0]
            ? [draft.selectedExercises[0].localId]
            : []
        );
        setCustomRestExerciseIds(
          draft.selectedExercises
            .filter(
              (exercise) =>
                exercise.restSeconds !== null &&
                !REST_SELECTOR_SECONDS.some(
                  (presetSeconds) =>
                    presetSeconds === exercise.restSeconds
                )
            )
            .map((exercise) => exercise.localId)
        );
      }

      setIsActiveWorkoutSessionReady(true);
    }, 0);

    return () => window.clearTimeout(restoreActiveWorkout);
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      void restTimer.initializeAudio();
    }
  }, [isEditing, restTimer]);

  useEffect(() => {
    if (isEditing || !isActiveWorkoutSessionReady) {
      return;
    }

    window.localStorage.setItem(
      getWorkoutDraftStorageKey(activeWorkoutSessionId),
      JSON.stringify({
        title,
        notes,
        visibility,
        selectedExercises,
      } satisfies ActiveWorkoutDraft)
    );
  }, [
    activeWorkoutSessionId,
    isActiveWorkoutSessionReady,
    isEditing,
    notes,
    selectedExercises,
    title,
    visibility,
  ]);

  function addExercise(exerciseId: string) {
    if (selectedExercises.some((item) => item.exerciseId === exerciseId)) {
      return;
    }

    const localId = crypto.randomUUID();

    setSelectedExercises((current) => [
      ...current,
      {
        localId,
        exerciseId,
        notes: null,
        restSeconds: DEFAULT_REST_SECONDS,
        sets: [{ ...EMPTY_SET }],
      },
    ]);
    setOpenExerciseIds((current) =>
      current.includes(localId) ? current : [...current, localId]
    );
  }

  function removeExercise(localId: string) {
    setSelectedExercises((current) =>
      current.filter((item) => item.localId !== localId)
    );
    setOpenExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
    setCustomRestExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
    setExercisePendingRemoval(null);
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

  function updateExerciseNotes(localId: string, value: string) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              notes: getTextValue(value),
            }
          : item
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
    updateExerciseRestSeconds(localId, Number(value));
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
    updateSet(localId, setIndex, "completed", completed);

    if (completed) {
      const durationSeconds = restSeconds ?? DEFAULT_REST_SECONDS;

      if (durationSeconds > 0) {
        void restTimer.initializeAudio();
        restTimer.startRestTimer({
          exerciseLocalId: localId,
          exerciseName,
          restSeconds: durationSeconds,
        });
      }
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

  function discardWorkout() {
    workoutTimer.clear();
    restTimer.clearRestTimer();
    clearActiveWorkoutSessionStorage(activeWorkoutSessionId);
    setSelectedExercises([]);
    setShowDiscardDialog(false);
    router.push("/workouts");
  }

  function updateSetRpe(value: number | null) {
    if (!activeRpeTarget) {
      return;
    }

    updateSet(
      activeRpeTarget.localId,
      activeRpeTarget.setIndex,
      "rpe",
      value === null ? "" : String(value)
    );
    setActiveRpeTarget((current) =>
      current
        ? {
            ...current,
            value,
          }
        : current
    );
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

  async function saveBodyweight() {
    const nextBodyweightKg = Number(bodyweightInput);

    if (
      !Number.isFinite(nextBodyweightKg) ||
      nextBodyweightKg < 20 ||
      nextBodyweightKg > 300
    ) {
      toast.error("Bodyweight must be between 20 and 300 kg.");
      return;
    }

    setIsSavingBodyweight(true);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bodyweightKg: nextBodyweightKg }),
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Unable to save bodyweight.")
        );
      }

      const payload = (await response.json()) as {
        bodyweightKg: number | null;
      };

      if (payload.bodyweightKg === null) {
        throw new Error("Unable to save bodyweight.");
      }

      setCurrentUserBodyweightKg(payload.bodyweightKg);
      setBodyweightInput(payload.bodyweightKg.toString());
      setIsBodyweightDialogOpen(false);
      toast.success("Bodyweight saved. Workout volume updated.");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to save bodyweight. Please try again.")
      );
    } finally {
      setIsSavingBodyweight(false);
    }
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
      startedAt: isEditing
        ? initialWorkout?.startedAt ?? new Date().toISOString()
        : new Date(
            Date.now() - workoutTimer.elapsedSeconds * 1000
          ).toISOString(),
      completedAt: new Date().toISOString(),
      visibility,
      exercises: selectedExercises.map(
        ({ exerciseId, notes, restSeconds, sets }) => ({
          exerciseId,
          notes,
          restSeconds,
          sets,
        })
      ),
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
      if (!isEditing) {
        workoutTimer.clear();
        restTimer.clearRestTimer();
        clearActiveWorkoutSessionStorage(activeWorkoutSessionId);
      }

      toast.success(isEditing ? "Workout updated." : "Workout finished.");
      router.push(`/workouts/${workout.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "We couldn't save your workout. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
    }
  }

  function renderExercisePicker() {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" className="w-full">
          <Link href="/exercises/custom/new">Create Custom Exercise</Link>
        </Button>
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
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {filteredExercises.map((exercise) => {
            const selected = selectedExercises.some(
              (item) => item.exerciseId === exercise.id
            );

            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => {
                  addExercise(exercise.id);
                  setIsExercisePickerOpen(false);
                }}
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
                  loading="lazy"
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
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:pb-24">
        <section className="space-y-4">
          <div className="sticky top-14 z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">
                  {title.trim() || (isEditing ? "Edit Workout" : "Workout")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {visibility === "PUBLIC" ? "Public" : "Private"}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => void saveWorkout()}
                disabled={isSaving}
              >
                {isSaving
                  ? "Finishing..."
                  : isEditing
                    ? "Save Changes"
                    : "Finish"}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-[11px] text-muted-foreground">Duration</p>
                <p className="font-semibold tabular-nums">
                  {workoutTimer.formattedElapsed}
                </p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-[11px] text-muted-foreground">Total volume</p>
                <p className="truncate font-semibold">
                  {needsBodyweightForVolume || liveVolumeKg === null
                    ? "-"
                    : formatVolumeKg(liveVolumeKg)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-[11px] text-muted-foreground">Done sets</p>
                <p className="font-semibold">{completedSetCount}</p>
              </div>
            </div>
          </div>

          {needsBodyweightForVolume ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Bodyweight required</AlertTitle>
              <AlertDescription>
                <p>
                  Some exercises in this workout need your bodyweight to
                  calculate volume. Total volume is unavailable until it is
                  set.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBodyweightInput("");
                    setIsBodyweightDialogOpen(true);
                  }}
                >
                  Set bodyweight
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Sheet open={isTimerSheetOpen} onOpenChange={setIsTimerSheetOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <TimerIcon className="size-4" />
                  {workoutTimer.formattedElapsed}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[85vh] rounded-t-2xl"
              >
                <SheetHeader>
                  <SheetTitle>Workout time</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 p-4">
                  <p className="text-4xl font-bold tabular-nums">
                    {workoutTimer.formattedElapsed}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {workoutTimer.status === "running" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={pauseWorkout}
                      >
                        Pause
                      </Button>
                    ) : workoutTimer.status === "paused" ? (
                      <Button type="button" onClick={resumeWorkout}>
                        Resume
                      </Button>
                    ) : (
                      <Button type="button" onClick={startWorkout}>
                        Start
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetWorkoutTimer}
                    >
                      Reset timer
                    </Button>
                    {restTimer.showTestSoundButton ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void testRestSound()}
                      >
                        Test sound
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowDiscardDialog(true)}
                    >
                      Discard workout
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={toggleRestSound}
            >
              Rest sounds: {restTimer.isMuted ? "Muted" : "On"}
            </Button>
            <Sheet
              open={isExercisePickerOpen}
              onOpenChange={setIsExercisePickerOpen}
            >
              <SheetTrigger asChild>
                <Button type="button" size="sm" className="lg:hidden">
                  Add Exercise
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[90vh] overflow-y-auto rounded-t-2xl"
              >
                <SheetHeader>
                  <SheetTitle>Add Exercise</SheetTitle>
                </SheetHeader>
                <div className="p-4">{renderExercisePicker()}</div>
              </SheetContent>
            </Sheet>
          </div>

          {restTimer.activeTimer ? (
            <div className="sticky top-[172px] z-20 rounded-lg border bg-card p-3 shadow-lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Rest timer: {restTimer.activeTimer.exerciseName}
                  </p>
                  <p className="text-xl font-bold tabular-nums">
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
                </div>
              </div>
            </div>
          ) : null}

          <Collapsible
            open={isWorkoutDetailsOpen}
            onOpenChange={setIsWorkoutDetailsOpen}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold">
                    {title.trim() ||
                      (isEditing ? "Edit Workout" : "New Workout")}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {visibility === "PUBLIC" ? "Public" : "Private"} details
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Workout details
                  </Button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="workout-title"
                      className="text-sm font-medium"
                    >
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
                    <label
                      htmlFor="workout-notes"
                      className="text-sm font-medium"
                    >
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
                      Public workouts can appear on follower feeds and your
                      public profile.
                    </p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {selectedExercises.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No exercises selected yet. Add one from the picker.
              </CardContent>
            </Card>
          ) : (
            <Accordion
              type="multiple"
              value={openExerciseIds}
              onValueChange={setOpenExerciseIds}
              className="space-y-2"
            >
              {selectedExercises.map((selectedExercise) => {
                const exercise = exercises.find(
                  (item) => item.id === selectedExercise.exerciseId
                );

                if (!exercise) {
                  return null;
                }

                const restSeconds =
                  selectedExercise.restSeconds ?? DEFAULT_REST_SECONDS;
                const isCustomRest =
                  customRestExerciseIds.includes(selectedExercise.localId) ||
                  !REST_SELECTOR_SECONDS.some(
                    (presetSeconds) => presetSeconds === restSeconds
                  );
                const completedSets = selectedExercise.sets.filter(
                  (set) => set.completed
                ).length;

                return (
                  <AccordionItem
                    key={selectedExercise.localId}
                    value={selectedExercise.localId}
                    className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                  >
                    <div className="flex min-w-0 items-stretch">
                      <AccordionTrigger className="min-w-0 px-3 py-2.5 hover:no-underline">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <Image
                            src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
                            alt=""
                            width={96}
                            height={96}
                            unoptimized
                            className="size-12 shrink-0 rounded-md bg-muted object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-sm font-semibold sm:text-base">
                              {exercise.name}
                            </h2>
                            <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                              <Badge variant="secondary" className="max-w-full truncate">
                                {exercise.muscle}
                              </Badge>
                              <Badge variant="outline" className="max-w-full truncate">
                                {getExerciseTrackingTypeLabel(
                                  exercise.trackingType
                                )}
                              </Badge>
                              <Badge variant="outline">
                                {getRestBadgeLabel(restSeconds)}
                              </Badge>
                              {exercise.createdByUserId ? (
                                <Badge variant="outline">Custom</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {completedSets} / {selectedExercise.sets.length} sets done
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <div className="flex shrink-0 items-start py-2 pr-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon-lg"
                              variant="ghost"
                              aria-label={`Manage ${exercise.name}`}
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                setExercisePendingRemoval({
                                  localId: selectedExercise.localId,
                                  exerciseName: exercise.name,
                                })
                              }
                            >
                              <Trash2 />
                              Remove exercise
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <AccordionContent className="space-y-3 border-t px-3 pt-3">
                      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-2">
                        <div className="space-y-1">
                          <Label htmlFor={`rest-${selectedExercise.localId}`}>
                            Rest
                          </Label>
                          <Select
                            value={isCustomRest ? "custom" : String(restSeconds)}
                            onValueChange={(value) =>
                              setExerciseRestMode(selectedExercise.localId, value)
                            }
                          >
                            <SelectTrigger
                              id={`rest-${selectedExercise.localId}`}
                              size="sm"
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
                          <div className="min-w-24 flex-1 space-y-1 sm:max-w-36">
                            <Label htmlFor={`custom-rest-${selectedExercise.localId}`}>
                              Seconds
                            </Label>
                            <Input
                              id={`custom-rest-${selectedExercise.localId}`}
                              className="h-7 min-w-0"
                              type="number"
                              min="0"
                              max="3600"
                              step="5"
                              value={restSeconds}
                              onChange={(event) =>
                                updateExerciseRestSeconds(
                                  selectedExercise.localId,
                                  Math.max(0, Number(event.target.value) || 0)
                                )
                              }
                            />
                          </div>
                        ) : null}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                selectedExercise.notes ? "secondary" : "outline"
                              }
                              aria-label={`Edit notes for ${exercise.name}`}
                            >
                              <MessageSquare />
                              Exercise notes
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-[min(18rem,calc(100vw-2rem))]"
                          >
                            <div className="space-y-2">
                              <Label htmlFor={`exercise-notes-${selectedExercise.localId}`}>
                                Notes for {exercise.name}
                              </Label>
                              <Input
                                id={`exercise-notes-${selectedExercise.localId}`}
                                value={selectedExercise.notes ?? ""}
                                onChange={(event) =>
                                  updateExerciseNotes(
                                    selectedExercise.localId,
                                    event.target.value
                                  )
                                }
                                placeholder="Exercise notes"
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        {selectedExercise.sets.map((set, setIndex) => (
                          <div
                            key={setIndex}
                            className={`rounded-md border border-border/70 p-1.5 transition-colors ${
                              set.completed
                                ? "border-primary/40 bg-primary/10"
                                : "bg-muted/20"
                            }`}
                          >
                            <div
                              className={`grid w-full min-w-0 items-center gap-1 ${getSetRowGridClass(
                                rpeTrackingEnabled
                              )}`}
                            >
                              <span
                                className="w-5 text-center text-xs font-semibold tabular-nums text-muted-foreground"
                                aria-label={`Set ${setIndex + 1}${set.completed ? ", completed" : ""}`}
                              >
                                {setIndex + 1}
                              </span>
                              <div
                                className={`grid min-w-0 gap-1 ${getSetFieldsGridClass(
                                  exercise.trackingType
                                )}`}
                              >
                                {isWeightFieldVisible(exercise.trackingType) ? (
                                  <Input
                                    className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.5"
                                    placeholder={
                                      exercise.trackingType === "WEIGHTED_BODYWEIGHT"
                                        ? "+kg"
                                        : "kg"
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
                                {isRepsFieldVisible(exercise.trackingType) ? (
                                  <Input
                                    className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
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
                                {isDurationFieldVisible(exercise.trackingType) ? (
                                  <Input
                                    className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.25"
                                    placeholder="Min"
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
                                    className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                                    type="number"
                                    inputMode="decimal"
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
                                {exercise.trackingType === "STEPS_DISTANCE_DURATION" ? (
                                  <Input
                                    className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                                    type="number"
                                    inputMode="numeric"
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
                                {exercise.trackingType === "FLOORS_DISTANCE_DURATION" ? (
                                  <Input
                                    className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                                    type="number"
                                    inputMode="numeric"
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
                              </div>
                              {rpeTrackingEnabled ? (
                                <Button
                                  type="button"
                                  size="icon-lg"
                                  variant={set.rpe ? "secondary" : "outline"}
                                  className={
                                    set.rpe
                                      ? "w-12 rounded-md border-primary/40 bg-primary/10 px-1 text-[11px] text-primary tabular-nums shadow-none"
                                      : "p-0"
                                  }
                                  aria-label={
                                    set.rpe
                                      ? `Edit set ${setIndex + 1} RPE, currently ${set.rpe}`
                                      : `Set RPE for set ${setIndex + 1}`
                                  }
                                  onClick={() =>
                                    setActiveRpeTarget({
                                      localId: selectedExercise.localId,
                                      setIndex,
                                      exerciseName: exercise.name,
                                      summary: formatSetSummary(
                                        set,
                                        exercise.trackingType
                                      ),
                                      value: set.rpe,
                                    })
                                  }
                                >
                                  {set.rpe ? `RPE ${set.rpe}` : <Gauge />}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="icon-lg"
                                variant={set.completed ? "secondary" : "outline"}
                                className={
                                  set.completed
                                    ? "border-primary/40 bg-primary/10 text-primary shadow-none"
                                    : undefined
                                }
                                aria-label={
                                  set.completed
                                    ? `Mark set ${setIndex + 1} incomplete`
                                    : `Mark set ${setIndex + 1} complete`
                                }
                                aria-pressed={set.completed}
                                onClick={() =>
                                  updateSetCompleted(
                                    selectedExercise.localId,
                                    setIndex,
                                    !set.completed,
                                    exercise.name,
                                    selectedExercise.restSeconds
                                  )
                                }
                              >
                                {set.completed ? <CheckCircle2 /> : <Circle />}
                              </Button>
                              <Button
                                type="button"
                                size="icon-lg"
                                variant="destructive"
                                aria-label={`Remove set ${setIndex + 1}`}
                                onClick={() =>
                                  removeSet(selectedExercise.localId, setIndex)
                                }
                                disabled={selectedExercise.sets.length <= 1}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => addSet(selectedExercise.localId)}
                      >
                        <Plus />
                        Add set
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </section>

        <aside className="hidden space-y-4 lg:block">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <h2 className="text-xl font-semibold">Exercise Picker</h2>
              <p className="text-sm text-muted-foreground">
                Search by exercise or muscle.
              </p>
            </CardHeader>
            <CardContent>{renderExercisePicker()}</CardContent>
          </Card>
        </aside>
      </div>

      <Dialog
        open={isBodyweightDialogOpen}
        onOpenChange={setIsBodyweightDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set your bodyweight</DialogTitle>
            <DialogDescription>
              Your bodyweight is used to calculate volume for bodyweight and
              weighted-bodyweight exercises.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveBodyweight();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="workout-bodyweight">Bodyweight</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="workout-bodyweight"
                  type="number"
                  inputMode="decimal"
                  min="20"
                  max="300"
                  step="0.1"
                  value={bodyweightInput}
                  onChange={(event) => setBodyweightInput(event.target.value)}
                  disabled={isSavingBodyweight}
                  autoFocus
                />
                <span className="shrink-0 text-sm text-muted-foreground">kg</span>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBodyweightDialogOpen(false)}
                disabled={isSavingBodyweight}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingBodyweight}>
                {isSavingBodyweight ? "Saving..." : "Save bodyweight"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeRpeTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveRpeTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How hard was this set?</DialogTitle>
            <DialogDescription>
              Choose an optional rate of perceived exertion for this set.
            </DialogDescription>
          </DialogHeader>
          {activeRpeTarget ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">{activeRpeTarget.exerciseName}</p>
                <p className="text-sm text-muted-foreground">
                  {activeRpeTarget.summary}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RPE_VALUES.map((rpe) => (
                  <Button
                    key={rpe}
                    type="button"
                    variant={
                      activeRpeTarget.value === rpe ? "default" : "outline"
                    }
                    className="h-auto flex-col items-start gap-1 whitespace-normal p-3 text-left"
                    onClick={() => updateSetRpe(rpe)}
                  >
                    <span className="text-base font-semibold">RPE {rpe}</span>
                    <span className="text-xs opacity-80">
                      {getRpeDescription(rpe)}
                    </span>
                  </Button>
                ))}
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updateSetRpe(null)}
                >
                  No RPE
                </Button>
                <Button type="button" onClick={() => setActiveRpeTarget(null)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(exercisePendingRemoval)}
        onOpenChange={(open) => {
          if (!open) {
            setExercisePendingRemoval(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              {exercisePendingRemoval?.exerciseName ?? "This exercise"} and all
              of its entered sets will be removed from this workout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep exercise</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (exercisePendingRemoval) {
                  removeExercise(exercisePendingRemoval.localId);
                }
              }}
            >
              Remove exercise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the active workout timer, rest timer, and unsaved
              workout sets. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep workout</AlertDialogCancel>
            <AlertDialogAction onClick={discardWorkout}>
              Discard workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
