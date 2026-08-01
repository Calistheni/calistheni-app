"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  CheckCircle2,
  Circle,
  EllipsisVertical,
  Gauge,
  Layers2,
  MessageSquare,
  Plus,
  Repeat2,
  Trash2,
  Unlink2,
} from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
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
  SheetDescription,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  formatElapsedTime,
  useWorkoutTimer,
} from "@/components/workouts/hooks/useWorkoutTimer";
import { useRestTimer } from "@/components/workouts/hooks/useRestTimer";
import { MobileActiveWorkoutHeader } from "@/components/workouts/MobileActiveWorkoutHeader";
import { SupersetGroupCard } from "@/components/workouts/SupersetGroupCard";
import {
  SupersetRoundForm,
  type SupersetRoundFormEntry,
} from "@/components/workouts/SupersetRoundForm";
import {
  SortableExerciseItem,
  SortableExerciseList,
} from "@/components/workouts/SortableExerciseList";
import { toast } from "sonner";
import { ExerciseDetailPreview } from "@/components/exercises/ExerciseDetailPreview";
import {
  clearActiveWorkoutSessionStorage,
  getOrCreateActiveWorkoutSessionId,
  getWorkoutDraftStorageKey,
  getWorkoutTimerStorageKey,
} from "@/lib/active-workout-session";
import {
  formatRestDuration,
  getExerciseThumbnailSrc,
  REST_SELECTOR_SECONDS,
} from "@/lib/exercise-display";
import {
  calculateWorkoutVolumeKg,
  isWorkoutVolumeSetIncluded,
} from "@/lib/workout-volume";
import {
  hasEnteredSetPerformance,
  isIncompleteEnteredSet,
} from "@/lib/workout-set-performance";
import {
  createSupersetKey,
  getNextSupersetSetDraft,
  getSupersetDisplayLabel,
  getSupersetRoundProgress,
  SUPERSET_COLOR_KEYS,
} from "@/lib/workout-supersets";
import {
  DEFAULT_WORKOUT_TITLE,
  getFinalWorkoutTitle,
} from "@/lib/workout-title";
import { getTrackingTypeFieldConfig } from "@/lib/exercise-tracking-fields";
import {
  getPerformanceReference,
  getPerformanceReferenceDescription,
  type ExercisePerformanceReferenceMap,
} from "@/lib/workout-performance-references";
import type {
  ExerciseListItem,
  WorkoutDetail,
  WorkoutExerciseInput,
  WorkoutMutationPayload,
  WorkoutSetInput,
  WorkoutSupersetInput,
} from "@/types/workout";

type WorkoutBuilderProps = {
  exercises: ExerciseListItem[];
  initialWorkout?: WorkoutDetail;
  userBodyweightKg: number | null;
  rpeTrackingEnabled: boolean;
  saveMode?: "create" | "edit";
};

type LocalWorkoutSet = WorkoutSetInput & {
  localId: string;
};

type LocalWorkoutExercise = Omit<WorkoutExerciseInput, "sets"> & {
  localId: string;
  sets: LocalWorkoutSet[];
};

type SupersetResultDraft = Record<
  string,
  { setIndex: number; setNumber: number; set: WorkoutSetInput }
>;

type ActiveWorkoutDraft = {
  title: string;
  notes: string;
  visibility: "PRIVATE" | "PUBLIC";
  supersets: WorkoutSupersetInput[];
  selectedExercises: LocalWorkoutExercise[];
};

const DEFAULT_REST_SECONDS = 90;
const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const COMPACT_WORKOUT_NUMBER_INPUT_CLASS =
  "h-9 min-w-0 text-base rounded-md bg-background/80 px-1.5 text-center font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const EMPTY_SET_VALUES: WorkoutSetInput = {
  reps: null,
  weight: null,
  durationSeconds: null,
  distanceMeters: null,
  steps: null,
  floors: null,
  rpe: null,
  notes: null,
  completed: false,
  supersetRoundIndex: null,
  supersetRoundId: null,
};

function createLocalSet(
  set: WorkoutSetInput = EMPTY_SET_VALUES,
  localId = crypto.randomUUID()
): LocalWorkoutSet {
  return { ...set, localId };
}

function toWorkoutSetInput(set: LocalWorkoutSet): WorkoutSetInput {
  return {
    reps: set.reps,
    weight: set.weight,
    durationSeconds: set.durationSeconds,
    distanceMeters: set.distanceMeters,
    steps: set.steps,
    floors: set.floors,
    rpe: set.rpe,
    notes: set.notes,
    completed: set.completed,
    supersetRoundIndex: set.supersetRoundIndex,
    supersetRoundId: set.supersetRoundId,
  };
}

function getNumberValue(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function getTextValue(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCustomRestSeconds(value: string) {
  const parsedValue = Number(value.trim());

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.min(3600, Math.max(0, Math.trunc(parsedValue)));
}

function getDurationMinutesValue(durationSeconds: number | null) {
  return durationSeconds === null ? "" : durationSeconds / 60;
}

function isRepsFieldVisible(trackingType: ExerciseListItem["trackingType"]) {
  return getTrackingTypeFieldConfig(trackingType).reps;
}

function isWeightFieldVisible(trackingType: ExerciseListItem["trackingType"]) {
  return getTrackingTypeFieldConfig(trackingType).weight;
}

function isDurationFieldVisible(
  trackingType: ExerciseListItem["trackingType"]
) {
  return getTrackingTypeFieldConfig(trackingType).duration;
}

function isDistanceFieldVisible(
  trackingType: ExerciseListItem["trackingType"]
) {
  return getTrackingTypeFieldConfig(trackingType).distance;
}

function usesBodyweightVolume(trackingType: ExerciseListItem["trackingType"]) {
  return (
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT"
  );
}

function getTrackingFamily(
  trackingType: ExerciseListItem["trackingType"]
) {
  if (
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT" ||
    trackingType === "EXTERNAL_WEIGHT"
  ) {
    return "reps";
  }

  if (trackingType === "DURATION") {
    return "duration";
  }

  if (
    trackingType === "DISTANCE_DURATION" ||
    trackingType === "STEPS_DISTANCE_DURATION" ||
    trackingType === "FLOORS_DISTANCE_DURATION" ||
    trackingType === "WEIGHT_DISTANCE_DURATION"
  ) {
    return "distance";
  }

  return "unspecified";
}

function getTrackingFields(
  trackingType: ExerciseListItem["trackingType"]
) {
  const fields = new Set<keyof WorkoutSetInput>();

  if (isRepsFieldVisible(trackingType)) fields.add("reps");
  if (isWeightFieldVisible(trackingType)) fields.add("weight");
  if (isDurationFieldVisible(trackingType)) fields.add("durationSeconds");
  if (isDistanceFieldVisible(trackingType)) fields.add("distanceMeters");
  if (trackingType === "STEPS_DISTANCE_DURATION") fields.add("steps");
  if (trackingType === "FLOORS_DISTANCE_DURATION") fields.add("floors");

  return fields;
}

function areTrackingTypesCompatible(
  currentType: ExerciseListItem["trackingType"],
  replacementType: ExerciseListItem["trackingType"]
) {
  if (getTrackingFamily(currentType) !== getTrackingFamily(replacementType)) {
    return false;
  }

  const replacementFields = getTrackingFields(replacementType);

  return [...getTrackingFields(currentType)].every((field) =>
    replacementFields.has(field)
  );
}

function preserveCompatibleSetFields(
  set: LocalWorkoutSet,
  trackingType: ExerciseListItem["trackingType"]
): LocalWorkoutSet {
  const fields = getTrackingFields(trackingType);

  return {
    ...set,
    reps: fields.has("reps") ? set.reps : null,
    weight: fields.has("weight") ? set.weight : null,
    durationSeconds: fields.has("durationSeconds")
      ? set.durationSeconds
      : null,
    distanceMeters: fields.has("distanceMeters") ? set.distanceMeters : null,
    steps: fields.has("steps") ? set.steps : null,
    floors: fields.has("floors") ? set.floors : null,
  };
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

    const selectedExercises = parsed.selectedExercises.map((exercise) => ({
      ...exercise,
      supersetKey:
        typeof exercise.supersetKey === "string" ? exercise.supersetKey : null,
      supersetPosition:
        typeof exercise.supersetPosition === "number"
          ? exercise.supersetPosition
          : null,
      localId:
        typeof exercise.localId === "string"
          ? exercise.localId
          : crypto.randomUUID(),
      sets: Array.isArray(exercise.sets)
        ? exercise.sets.map((set) =>
            createLocalSet(
              toWorkoutSetInput(set as LocalWorkoutSet),
              typeof (set as Partial<LocalWorkoutSet>).localId === "string"
                ? (set as LocalWorkoutSet).localId
                : crypto.randomUUID()
            )
          )
        : [],
    }));

    const supersets = Array.isArray(parsed.supersets)
      ? parsed.supersets.map((superset) => ({
          ...superset,
          exerciseLocalIds: Array.isArray(superset.exerciseLocalIds)
            ? superset.exerciseLocalIds.filter(
                (localId): localId is string => typeof localId === "string"
              )
            : selectedExercises
                .filter((exercise) => exercise.supersetKey === superset.key)
                .sort(
                  (left, right) =>
                    (left.supersetPosition ?? 0) -
                    (right.supersetPosition ?? 0)
                )
                .map((exercise) => exercise.localId),
        }))
      : [];

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      visibility:
        parsed.visibility === "PRIVATE" || parsed.visibility === "PUBLIC"
          ? parsed.visibility
          : "PUBLIC",
      supersets,
      selectedExercises,
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
    supersetKey: workoutExercise.supersetKey,
    supersetPosition: workoutExercise.supersetPosition,
    sets: workoutExercise.sets.map((set) =>
      createLocalSet(
        {
          reps: set.reps,
          weight: set.weight,
          durationSeconds: set.durationSeconds,
          distanceMeters: set.distanceMeters,
          steps: set.steps,
          floors: set.floors,
          rpe: set.rpe,
          notes: set.notes,
          completed: set.completed,
          supersetRoundIndex: set.supersetRoundIndex,
          supersetRoundId: set.supersetRoundId,
        },
        `workout-set-${set.id}`
      )
    ),
  }));
}

function buildInitialSupersets(
  initialWorkout: WorkoutDetail | undefined,
  exercises: LocalWorkoutExercise[]
) {
  if (!initialWorkout) return [];
  return initialWorkout.supersets.map((superset) => ({
    ...superset,
    exerciseLocalIds:
      superset.exerciseLocalIds?.length > 0
        ? superset.exerciseLocalIds
        : exercises
            .filter((exercise) => exercise.supersetKey === superset.key)
            .sort(
              (left, right) =>
                (left.supersetPosition ?? 0) - (right.supersetPosition ?? 0)
            )
            .map((exercise) => exercise.localId),
  }));
}

function getSupersetMembers(
  supersets: WorkoutSupersetInput[],
  exercises: LocalWorkoutExercise[],
  key: string
) {
  const superset = supersets.find((item) => item.key === key);
  if (!superset) return [];
  return superset.exerciseLocalIds
    .map((localId) => exercises.find((exercise) => exercise.localId === localId))
    .filter((exercise): exercise is LocalWorkoutExercise => Boolean(exercise));
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
  const initialSupersets = buildInitialSupersets(
    initialWorkout,
    initialSelectedExercises
  );
  const workoutTimer = useWorkoutTimer(
    getWorkoutTimerStorageKey(activeWorkoutSessionId),
    !isEditing && isActiveWorkoutSessionReady
  );
  const restTimer = useRestTimer();
  const exercisePickerContentRef = useRef<HTMLDivElement>(null);
  const setRowRefs = useRef(new Map<string, HTMLDivElement>());
  const completionViewportAnchorRef = useRef<{
    setLocalId: string;
    top: number;
    waitForRestTimerExerciseId: string | null;
  } | null>(null);
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
  const [performanceReferences, setPerformanceReferences] = useState<ExercisePerformanceReferenceMap>({});
  const selectedExerciseIds = useMemo(
    () => [...new Set(selectedExercises.map((exercise) => exercise.exerciseId))],
    [selectedExercises]
  );
  const [supersets, setSupersets] = useState<WorkoutSupersetInput[]>(
    initialSupersets
  );

  useEffect(() => {
    const exerciseIds = selectedExerciseIds;
    if (!exerciseIds.length) {
      return;
    }
    const controller = new AbortController();
    void fetch("/api/user/workout-performance-references", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exerciseIds,
        excludeWorkoutId: initialWorkout && initialWorkout.id > 0 ? initialWorkout.id : undefined,
        before: isEditing ? initialWorkout?.startedAt : undefined,
      }),
    })
      .then(async (response) => response.ok ? (await response.json()) as { references: ExercisePerformanceReferenceMap } : null)
      .then((payload) => { if (payload) setPerformanceReferences(payload.references); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) console.error("[workout-performance-references]", error); });
    return () => controller.abort();
  }, [initialWorkout, isEditing, selectedExerciseIds]);
  const [openSupersetKeys, setOpenSupersetKeys] = useState<string[]>(
    initialSupersets.map((superset) => superset.key)
  );
  const [isMobileViewport, setIsMobileViewport] = useState(false);
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
  const [customRestInputs, setCustomRestInputs] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      initialSelectedExercises
        .filter(
          (exercise) =>
            exercise.restSeconds !== null &&
            !REST_SELECTOR_SECONDS.some(
              (presetSeconds) => presetSeconds === exercise.restSeconds
            )
        )
        .map((exercise) => [exercise.localId, String(exercise.restSeconds)])
    )
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
  const [exerciseToReplaceId, setExerciseToReplaceId] = useState<string | null>(
    null
  );
  const [pendingIncompatibleReplacement, setPendingIncompatibleReplacement] =
    useState<{
      localId: string;
      currentExercise: ExerciseListItem;
      replacementExercise: ExerciseListItem;
    } | null>(null);
  const [exercisePickerViewport, setExercisePickerViewport] = useState<{
    height: number;
    bottom: number;
  } | null>(null);
  const [isTimerSheetOpen, setIsTimerSheetOpen] = useState(false);
  const [isFinishSheetOpen, setIsFinishSheetOpen] = useState(false);
  const [showIncompleteSetsDialog, setShowIncompleteSetsDialog] =
    useState(false);
  const [warnedSetIds, setWarnedSetIds] = useState<string[]>([]);
  const [scrollTargetSetId, setScrollTargetSetId] = useState<string | null>(
    null
  );
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [activeRpeTarget, setActiveRpeTarget] = useState<{
    localId: string;
    setIndex: number;
    exerciseName: string;
    summary: string;
    value: number | null;
  } | null>(null);
  const [supersetEditorKey, setSupersetEditorKey] = useState<string | "new" | null>(
    null
  );
  const [supersetSelection, setSupersetSelection] = useState<string[]>([]);
  const [supersetRestSeconds, setSupersetRestSeconds] = useState<number | null>(
    DEFAULT_REST_SECONDS
  );
  const [supersetPendingDissolve, setSupersetPendingDissolve] = useState<
    string | null
  >(null);
  const [resultsSupersetKey, setResultsSupersetKey] = useState<string | null>(
    null
  );
  const [supersetResultDraft, setSupersetResultDraft] =
    useState<SupersetResultDraft>({});
  const [isCompletingSuperset, setIsCompletingSuperset] = useState(false);
  const isCompletingSupersetRef = useRef(false);
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
  const activeResultsSuperset = resultsSupersetKey
    ? supersets.find((superset) => superset.key === resultsSupersetKey) ?? null
    : null;
  const activeResultsSupersetIndex = activeResultsSuperset
    ? supersets.findIndex(
        (superset) => superset.key === activeResultsSuperset.key
      )
    : -1;
  const activeResultsMembers = activeResultsSuperset
    ? getSupersetMembers(supersets, selectedExercises, activeResultsSuperset.key)
    : [];
  const activeResultsProgress = activeResultsSuperset
    ? getSupersetRoundProgress(
        activeResultsMembers,
        {
          hardRoundLimit: activeResultsSuperset.hardRoundLimit,
          supersetKey: activeResultsSuperset.key,
        }
      )
    : null;
  const getSetPlaceholder = (
    exerciseId: string,
    setIndex: number,
    metric: "reps" | "weight" | "durationSeconds" | "distanceMeters" | "steps" | "floors",
    fallback: string
  ) => getPerformanceReference(performanceReferences[exerciseId], metric, setIndex, fallback);
  const getSetReferenceDescription = (
    exerciseId: string,
    setIndex: number,
    metric: "reps" | "weight" | "durationSeconds" | "distanceMeters" | "steps" | "floors"
  ) => getPerformanceReferenceDescription(performanceReferences[exerciseId], metric, setIndex);
  const supersetRoundFormEntries = activeResultsMembers.flatMap(
    (selectedExercise): SupersetRoundFormEntry[] => {
      const entry = supersetResultDraft[selectedExercise.localId];
      const exercise = exercises.find(
        (item) => item.id === selectedExercise.exerciseId
      );
      if (!entry || !exercise) return [];

      return [
        {
          localId: selectedExercise.localId,
          exerciseName: exercise.name,
          setIndex: entry.setIndex,
          setNumber: entry.setNumber,
          set: entry.set,
          showWeight: isWeightFieldVisible(exercise.trackingType),
          weightedBodyweight:
            exercise.trackingType === "WEIGHTED_BODYWEIGHT",
          showReps: isRepsFieldVisible(exercise.trackingType),
          showDuration: isDurationFieldVisible(exercise.trackingType),
          showDistance: isDistanceFieldVisible(exercise.trackingType),
          showSteps:
            exercise.trackingType === "STEPS_DISTANCE_DURATION",
          showFloors:
            exercise.trackingType === "FLOORS_DISTANCE_DURATION",
          performanceReference: performanceReferences[exercise.id],
        },
      ];
    }
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
              completed: set.completed,
            })),
          })
        ),
        userBodyweightKg: currentUserBodyweightKg,
      }),
    [currentUserBodyweightKg, selectedExercisesWithMetadata]
  );
  const needsBodyweightForVolume =
    currentUserBodyweightKg === null &&
    liveVolumeKg === null &&
    selectedExercisesWithMetadata.some(({ selectedExercise, exercise }) =>
      usesBodyweightVolume(exercise.trackingType) &&
      selectedExercise.sets.some(isWorkoutVolumeSetIncluded)
    );
  const completedSetCount = selectedExercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => set.completed).length,
    0
  );
  const incompleteEnteredSets = useMemo(
    () =>
      selectedExercisesWithMetadata.flatMap(
        ({ selectedExercise, exercise }) =>
          selectedExercise.sets.flatMap((set, setIndex) =>
            isIncompleteEnteredSet(set, exercise.trackingType)
              ? [
                  {
                    exerciseLocalId: selectedExercise.localId,
                    exerciseName: exercise.name,
                    setLocalId: set.localId,
                    setNumber: setIndex + 1,
                  },
                ]
              : []
          )
      ),
    [selectedExercisesWithMetadata]
  );
  const activeWarnedSetIds = useMemo(() => {
    const currentIds = new Set(
      incompleteEnteredSets.map(({ setLocalId }) => setLocalId)
    );

    return warnedSetIds.filter((setId) => currentIds.has(setId));
  }, [incompleteEnteredSets, warnedSetIds]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!isExercisePickerOpen) {
      return;
    }

    const viewport = window.visualViewport;

    function updateViewport() {
      if (!viewport) {
        setExercisePickerViewport({
          height: Math.round(window.innerHeight * 0.9),
          bottom: 0,
        });
        return;
      }

      setExercisePickerViewport({
        height: Math.round(
          Math.min(viewport.height, window.innerHeight * 0.9)
        ),
        bottom: Math.max(
          0,
          Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
        ),
      });
    }

    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [isExercisePickerOpen]);

  useEffect(() => {
    if (!scrollTargetSetId) {
      return;
    }

    const row = setRowRefs.current.get(scrollTargetSetId);

    if (!row) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      row.focus({ preventScroll: true });
      row.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      setScrollTargetSetId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [openExerciseIds, scrollTargetSetId]);

  useLayoutEffect(() => {
    const anchor = completionViewportAnchorRef.current;

    if (!anchor) {
      return;
    }

    if (
      anchor.waitForRestTimerExerciseId &&
      restTimer.activeTimer?.exerciseLocalId !==
        anchor.waitForRestTimerExerciseId
    ) {
      return;
    }

    const row = setRowRefs.current.get(anchor.setLocalId);

    if (row) {
      const offset = row.getBoundingClientRect().top - anchor.top;

      if (Math.abs(offset) > 0.5) {
        window.scrollBy({ top: offset, left: 0, behavior: "auto" });
      }
    }

    completionViewportAnchorRef.current = null;
  }, [restTimer.activeTimer, selectedExercises]);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const sessionId = getOrCreateActiveWorkoutSessionId();
      const draft = readActiveWorkoutDraft(sessionId);

      setActiveWorkoutSessionId(sessionId);

      if (draft) {
        setTitle(draft.title);
        setNotes(draft.notes);
        setVisibility(draft.visibility);
        setSupersets(draft.supersets);
        setOpenSupersetKeys(draft.supersets.map((superset) => superset.key));
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
        setCustomRestInputs(
          Object.fromEntries(
            draft.selectedExercises
              .filter(
                (exercise) =>
                  exercise.restSeconds !== null &&
                  !REST_SELECTOR_SECONDS.some(
                    (presetSeconds) =>
                      presetSeconds === exercise.restSeconds
                  )
              )
              .map((exercise) => [
                exercise.localId,
                String(exercise.restSeconds),
              ])
          )
        );
      }

      setIsActiveWorkoutSessionReady(true);
    });

    return () => {
      cancelled = true;
    };
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
        supersets,
        selectedExercises,
      } satisfies ActiveWorkoutDraft)
    );
  }, [
    activeWorkoutSessionId,
    isActiveWorkoutSessionReady,
    isEditing,
    notes,
    selectedExercises,
    supersets,
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
        supersetKey: null,
        supersetPosition: null,
        sets: [createLocalSet()],
      },
    ]);
    setOpenExerciseIds((current) =>
      current.includes(localId) ? current : [...current, localId]
    );
  }

  function openSupersetEditor(key: string | "new") {
    const superset =
      key === "new" ? null : supersets.find((item) => item.key === key);
    const members = superset
      ? getSupersetMembers(supersets, selectedExercises, superset.key).map(
          (exercise) => exercise.localId
        )
      : [];

    setSupersetEditorKey(key);
    setSupersetSelection(members);
    setSupersetRestSeconds(superset?.restSeconds ?? DEFAULT_REST_SECONDS);
  }

  function saveSuperset() {
    if (supersetSelection.length < 2) {
      toast.error("Select at least two exercises.");
      return;
    }

    const existing =
      supersetEditorKey && supersetEditorKey !== "new"
        ? supersets.find((item) => item.key === supersetEditorKey)
        : null;
    const key = existing?.key ?? createSupersetKey();

    if (existing) {
      setSupersets((current) =>
        current.map((item) =>
          item.key === key
            ? { ...item, restSeconds: supersetRestSeconds }
            : item
        )
      );
    } else {
      const groupIndex = supersets.length;
      setSupersets((current) => [
        ...current,
        {
          key,
          label: null,
          colorKey:
            SUPERSET_COLOR_KEYS[groupIndex % SUPERSET_COLOR_KEYS.length],
          restSeconds: supersetRestSeconds,
          plannedRounds: null,
          hardRoundLimit: null,
          exerciseLocalIds: supersetSelection,
        },
      ]);
    }

    if (existing) {
      setSupersets((current) =>
        current.map((item) =>
          item.key === key
            ? { ...item, exerciseLocalIds: supersetSelection }
            : item
        )
      );
    }
    setOpenExerciseIds((current) => [
      ...current,
      ...supersetSelection.filter((id) => !current.includes(id)),
    ]);
    setOpenSupersetKeys((current) =>
      current.includes(key) ? current : [...current, key]
    );
    setSupersetEditorKey(null);
    toast.success(existing ? "Superset updated." : "Superset created.");
  }

  function dissolveSuperset(key: string) {
    setSupersets((current) => current.filter((item) => item.key !== key));
    setOpenSupersetKeys((current) => current.filter((item) => item !== key));
    setSupersetPendingDissolve(null);
    toast.success("Superset dissolved. Exercise data was kept.");
  }

  function removeExerciseFromSuperset(key: string, localId: string) {
    const superset = supersets.find((item) => item.key === key);
    if (!superset) return;
    const remaining = superset.exerciseLocalIds.filter((id) => id !== localId);

    if (remaining.length < 2) {
      dissolveSuperset(key);
      return;
    }

    setSupersets((current) =>
      current.map((item) =>
        item.key === key ? { ...item, exerciseLocalIds: remaining } : item
      )
    );
  }

  function openSupersetResults(key: string) {
    const draft: SupersetResultDraft = {};

    const members = getSupersetMembers(supersets, selectedExercises, key);
    const progress = getSupersetRoundProgress(
      members,
      {
        hardRoundLimit:
          supersets.find((superset) => superset.key === key)
            ?.hardRoundLimit ?? null,
        supersetKey: key,
      }
    );
    if (progress.complete) {
      return;
    }

    const roundId = `${key}:${crypto.randomUUID()}`;

    for (const exercise of members) {
      const { setIndex, setNumber, source } = getNextSupersetSetDraft(exercise.sets);
      draft[exercise.localId] = {
        setIndex,
        setNumber,
        set: {
          ...toWorkoutSetInput(source ?? createLocalSet()),
          completed: false,
          supersetRoundIndex: progress.currentRound - 1,
          supersetRoundId: roundId,
        },
      };
    }

    setSupersetResultDraft(draft);
    setResultsSupersetKey(key);
  }

  function completeSupersetRound(
    key: string,
    resultDraft?: SupersetResultDraft
  ) {
    if (isCompletingSupersetRef.current) return;

    const superset = supersets.find((item) => item.key === key);
    if (!superset) return;

    isCompletingSupersetRef.current = true;
    setIsCompletingSuperset(true);
    setSelectedExercises((current) => {
      const memberIds = new Set(superset.exerciseLocalIds);
      return current.map((exercise) => {
        if (!memberIds.has(exercise.localId)) return exercise;
        const draft = resultDraft?.[exercise.localId];
        if (!draft) return exercise;
        if (draft.setIndex < 0) {
          return {
            ...exercise,
            sets: [
              ...exercise.sets,
              createLocalSet({
                ...draft.set,
                completed: true,
              }),
            ],
          };
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set, index) =>
            index === draft.setIndex
              ? {
                  ...set,
                  ...(draft?.set ?? {}),
                  localId: set.localId,
                  completed: true,
                }
              : set
          ),
        };
      });
    });

    if (superset.restSeconds && superset.restSeconds > 0) {
      void restTimer.initializeAudio();
      restTimer.startRestTimer({
        exerciseLocalId: key,
        exerciseName: getSupersetDisplayLabel(
          superset,
          supersets.findIndex((item) => item.key === key)
        ),
        restSeconds: superset.restSeconds,
      });
    }

    setResultsSupersetKey(null);
    setSupersetResultDraft({});
    queueMicrotask(() => {
      isCompletingSupersetRef.current = false;
      setIsCompletingSuperset(false);
    });
    toast.success(
      superset.restSeconds
        ? "Superset completed. Rest started."
        : "Superset completed."
    );
  }

  function updateSupersetResult(
    localId: string,
    field: keyof WorkoutSetInput,
    value: string
  ) {
    setSupersetResultDraft((current) => {
      const entry = current[localId];
      if (!entry) return current;

      return {
        ...current,
        [localId]: {
          ...entry,
          set: {
            ...entry.set,
            [field]:
              field === "notes"
                ? getTextValue(value)
                : getNumberValue(value),
          },
        },
      };
    });
  }

  function moveExercise(activeId: string, overId: string) {
    setSelectedExercises((current) => {
      const activeIndex = current.findIndex((item) => item.localId === activeId);
      const overIndex = current.findIndex((item) => item.localId === overId);

      if (activeIndex < 0 || overIndex < 0) {
        return current;
      }
      if (
        current[activeIndex] &&
        supersets.some((superset) =>
          superset.exerciseLocalIds.includes(current[activeIndex].localId)
        )
      ) {
        return current;
      }

      return arrayMove(current, activeIndex, overIndex);
    });
  }

  function moveExerciseBy(localId: string, offset: -1 | 1) {
    setSelectedExercises((current) => {
      const currentIndex = current.findIndex((item) => item.localId === localId);
      const nextIndex = currentIndex + offset;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= current.length
      ) {
        return current;
      }
      if (
        current[currentIndex] &&
        supersets.some((superset) =>
          superset.exerciseLocalIds.includes(current[currentIndex].localId)
        )
      ) {
        return current;
      }

      return arrayMove(current, currentIndex, nextIndex);
    });
  }

  function replaceExercise(
    localId: string,
    replacementExercise: ExerciseListItem,
    preserveSetData: boolean
  ) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              exerciseId: replacementExercise.id,
              sets: item.sets.map((set) =>
                preserveSetData
                  ? preserveCompatibleSetFields(
                      set,
                      replacementExercise.trackingType
                    )
                  : createLocalSet(EMPTY_SET_VALUES, set.localId)
              ),
            }
          : item
      )
    );
    setPendingIncompatibleReplacement(null);
  }

  function selectExercise(exercise: ExerciseListItem) {
    if (!exerciseToReplaceId) {
      addExercise(exercise.id);
      handleExercisePickerOpenChange(false);
      return;
    }

    const currentExerciseState = selectedExercises.find(
      (item) => item.localId === exerciseToReplaceId
    );
    const currentExercise = exercises.find(
      (item) => item.id === currentExerciseState?.exerciseId
    );

    if (!currentExercise || currentExercise.id === exercise.id) {
      handleExercisePickerOpenChange(false);
      return;
    }

    if (
      areTrackingTypesCompatible(
        currentExercise.trackingType,
        exercise.trackingType
      )
    ) {
      replaceExercise(exerciseToReplaceId, exercise, true);
      toast.success(`${currentExercise.name} replaced with ${exercise.name}.`);
      handleExercisePickerOpenChange(false);
      return;
    }

    setPendingIncompatibleReplacement({
      localId: exerciseToReplaceId,
      currentExercise,
      replacementExercise: exercise,
    });
    handleExercisePickerOpenChange(false);
  }

  function openReplaceExercise(localId: string) {
    setExerciseToReplaceId(localId);
    setIsExercisePickerOpen(true);
  }

  function removeExercise(localId: string) {
    setSelectedExercises((current) => current.filter((item) => item.localId !== localId));
    setSupersets((current) =>
      current.flatMap((superset) => {
        const exerciseLocalIds = superset.exerciseLocalIds.filter(
          (id) => id !== localId
        );
        return exerciseLocalIds.length >= 2
          ? [{ ...superset, exerciseLocalIds }]
          : [];
      })
    );
    setOpenExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
    setCustomRestExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
    setCustomRestInputs((current) => {
      const remaining = { ...current };
      delete remaining[localId];
      return remaining;
    });
    setExercisePendingRemoval(null);
  }

  function addSet(localId: string) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              sets: [...item.sets, createLocalSet()],
            }
          : item
      )
    );
  }

  function handleExercisePickerOpenChange(open: boolean) {
    setIsExercisePickerOpen(open);

    if (!open) {
      setSearch("");
      setMuscleFilter("all");
      setExerciseToReplaceId(null);
      setExercisePickerViewport(null);
    }
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
      setCustomRestInputs((current) => ({
        ...current,
        [localId]: "",
      }));
      return;
    }

    setCustomRestExerciseIds((current) =>
      current.filter((item) => item !== localId)
    );
    setCustomRestInputs((current) => {
      const remaining = { ...current };
      delete remaining[localId];
      return remaining;
    });
    updateExerciseRestSeconds(localId, Number(value));
  }

  function commitCustomRestSeconds(localId: string, value: string) {
    const restSeconds = normalizeCustomRestSeconds(value);

    updateExerciseRestSeconds(localId, restSeconds);
    setCustomRestInputs((current) => ({
      ...current,
      [localId]: value.trim() === "" ? "" : String(restSeconds),
    }));
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
    const workoutExercise = selectedExercises.find(
      (exercise) => exercise.localId === localId
    );
    const setLocalId = workoutExercise?.sets.at(setIndex)?.localId;
    const row = setLocalId ? setRowRefs.current.get(setLocalId) : null;

    if (setLocalId && row) {
      const durationSeconds = restSeconds ?? DEFAULT_REST_SECONDS;

      completionViewportAnchorRef.current = {
        setLocalId,
        top: row.getBoundingClientRect().top,
        waitForRestTimerExerciseId:
          completed && durationSeconds > 0 ? localId : null,
      };
    }

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

  function requestFinishWorkout() {
    if (incompleteEnteredSets.length === 0) {
      setWarnedSetIds([]);
      setIsFinishSheetOpen(true);
      return;
    }

    setWarnedSetIds(
      incompleteEnteredSets.map(({ setLocalId }) => setLocalId)
    );
    setShowIncompleteSetsDialog(true);
  }

  function reviewIncompleteSets() {
    const affectedExerciseIds = incompleteEnteredSets.map(
      ({ exerciseLocalId }) => exerciseLocalId
    );

    setOpenExerciseIds((current) => [
      ...current,
      ...affectedExerciseIds.filter(
        (exerciseId) => !current.includes(exerciseId)
      ),
    ]);
    setScrollTargetSetId(incompleteEnteredSets[0]?.setLocalId ?? null);
  }

  function finishWithIncompleteSets() {
    setIsFinishSheetOpen(true);
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
    if (isSaving) {
      return;
    }

    if (selectedExercises.length === 0) {
      toast.error("Select at least one exercise.");
      return;
    }

    if (selectedExercises.some((exercise) => exercise.sets.length === 0)) {
      toast.error("Each exercise needs at least one set.");
      return;
    }

    const finalTitle = isEditing
      ? getTextValue(title)
      : getFinalWorkoutTitle(title);

    if (!isEditing && title.trim() === "") {
      setTitle(finalTitle ?? DEFAULT_WORKOUT_TITLE);
    }

    const payload: WorkoutMutationPayload = {
      title: finalTitle,
      notes: getTextValue(notes),
      startedAt: isEditing
        ? initialWorkout?.startedAt ?? new Date().toISOString()
        : new Date(
            Date.now() - workoutTimer.elapsedSeconds * 1000
          ).toISOString(),
      completedAt: new Date().toISOString(),
      visibility,
      supersets,
      exercises: selectedExercises.map(
        ({
          localId,
          exerciseId,
          notes,
          restSeconds,
          sets,
        }) => ({
          localId,
          exerciseId,
          notes,
          restSeconds,
          supersetKey: null,
          supersetPosition: null,
          sets: sets.map(toWorkoutSetInput),
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

  function renderExercisePicker(keyboardSafe = false) {
    return (
      <div
        className={
          keyboardSafe
            ? "flex min-h-0 flex-1 flex-col gap-3"
            : "space-y-4"
        }
      >
        {!exerciseToReplaceId ? (
          <Button asChild variant="outline" className="w-full">
            <Link href="/exercises/custom/new">Create Custom Exercise</Link>
          </Button>
        ) : null}
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
        <div
          className={
            keyboardSafe
              ? "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
              : "max-h-[65dvh] space-y-2 overflow-y-auto pr-1"
          }
        >
          {filteredExercises.map((exercise) => {
            const selectedElsewhere = selectedExercises.some(
              (item) =>
                item.exerciseId === exercise.id &&
                item.localId !== exerciseToReplaceId
            );
            const isCurrentExercise = selectedExercises.some(
              (item) =>
                item.localId === exerciseToReplaceId &&
                item.exerciseId === exercise.id
            );
            const unavailable = selectedElsewhere || isCurrentExercise;

            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => selectExercise(exercise)}
                disabled={unavailable}
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
                <Badge variant={unavailable ? "secondary" : "outline"}>
                  {isCurrentExercise
                    ? "Current"
                    : selectedElsewhere
                      ? "Added"
                      : exerciseToReplaceId
                        ? "Replace"
                        : "Add"}
                </Badge>
              </button>
            );
          })}
          {search.trim() && filteredExercises.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No exercises match your search.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSupersetExerciseRow(
    selectedExercise: LocalWorkoutExercise,
    groupPosition: number,
    supersetLabel: string,
    supersetKey: string
  ) {
    const exercise = exercises.find(
      (item) => item.id === selectedExercise.exerciseId
    );
    if (!exercise) return null;
    const completedSets = selectedExercise.sets.filter(
      (set) => set.completed
    ).length;

    return (
      <AccordionItem
        key={selectedExercise.localId}
        value={selectedExercise.localId}
        className="border-b border-border/70 last:border-b-0"
      >
        <div className="flex min-w-0 items-stretch">
          <AccordionTrigger className="w-full min-w-0 px-3 py-2.5 pl-4 hover:no-underline">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Image
                src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
                alt=""
                width={96}
                height={96}
                unoptimized
                className="size-11 shrink-0 rounded-md bg-muted object-cover"
              />
              <div className="min-w-0 flex-1 text-left">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 px-1.5 text-[10px]"
                  >
                    {supersetLabel.replace("Superset ", "")}
                    {groupPosition + 1}
                  </Badge>
                  <h3 className="truncate text-sm font-semibold">
                    {exercise.name}
                  </h3>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {exercise.muscle}
                </p>
              </div>
              <span
                className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground"
                aria-label={`${completedSets} of ${selectedExercise.sets.length} sets completed`}
              >
                {completedSets}/{selectedExercise.sets.length}
              </span>
            </div>
          </AccordionTrigger>
          <div className="flex shrink-0 items-center pr-1">
            <ExerciseDetailPreview exercise={exercise} compact />
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
                  onSelect={() => openReplaceExercise(selectedExercise.localId)}
                >
                  <Repeat2 />
                  Replace exercise
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    removeExerciseFromSuperset(supersetKey, selectedExercise.localId)
                  }
                >
                  <Unlink2 />
                  Remove from superset
                </DropdownMenuItem>
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
        <AccordionContent className="space-y-2 border-t border-border/60 bg-muted/15 px-3 pt-2 pb-3 pl-4">
          <div className="flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={selectedExercise.notes ? "secondary" : "outline"}
                >
                  <MessageSquare />
                  Notes
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
          <div className="space-y-1.5">
            {selectedExercise.sets.map((set, setIndex) => {
              const isWarned =
                activeWarnedSetIds.includes(set.localId) &&
                isIncompleteEnteredSet(set, exercise.trackingType);

              return (
                <div
                  key={set.localId}
                  ref={(row) => {
                    if (row) setRowRefs.current.set(set.localId, row);
                    else setRowRefs.current.delete(set.localId);
                  }}
                  className={`rounded-md border p-1.5 ${
                    isWarned
                      ? "border-destructive bg-destructive/10"
                      : set.completed
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/70 bg-background/70"
                  }`}
                >
                  <div
                    className={`grid w-full min-w-0 items-center gap-1 ${getSetRowGridClass(
                      rpeTrackingEnabled
                    )}`}
                  >
                    <span className="w-5 text-center text-xs font-semibold tabular-nums text-muted-foreground">
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
                            getSetPlaceholder(exercise.id, setIndex, "weight", "Weight")
                          }
                          aria-description={getSetReferenceDescription(exercise.id, setIndex, "weight")}
                          aria-label={`${exercise.name} set ${setIndex + 1} weight`}
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
                          placeholder={getSetPlaceholder(exercise.id, setIndex, "reps", "Reps")}
                          aria-description={getSetReferenceDescription(exercise.id, setIndex, "reps")}
                          aria-label={`${exercise.name} set ${setIndex + 1} reps`}
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
                          placeholder={getSetPlaceholder(exercise.id, setIndex, "durationSeconds", "Duration")}
                          aria-description={getSetReferenceDescription(exercise.id, setIndex, "durationSeconds")}
                          aria-label={`${exercise.name} set ${setIndex + 1} duration minutes`}
                          value={getDurationMinutesValue(set.durationSeconds)}
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
                          placeholder={getSetPlaceholder(exercise.id, setIndex, "distanceMeters", "Distance")}
                          aria-description={getSetReferenceDescription(exercise.id, setIndex, "distanceMeters")}
                          aria-label={`${exercise.name} set ${setIndex + 1} distance`}
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
                          className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          placeholder={getSetPlaceholder(exercise.id, setIndex, "steps", "Steps")}
                          aria-description={getSetReferenceDescription(exercise.id, setIndex, "steps")}
                          aria-label={`${exercise.name} set ${setIndex + 1} steps`}
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
                          className={COMPACT_WORKOUT_NUMBER_INPUT_CLASS}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          placeholder={getSetPlaceholder(exercise.id, setIndex, "floors", "Floors")}
                          aria-description={getSetReferenceDescription(exercise.id, setIndex, "floors")}
                          aria-label={`${exercise.name} set ${setIndex + 1} floors`}
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
                            ? "w-12 border-primary/40 bg-primary/10 px-1 text-[11px] text-primary"
                            : undefined
                        }
                        aria-label={`Set ${setIndex + 1} RPE`}
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
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : undefined
                      }
                      aria-label={`Mark ${exercise.name} set ${setIndex + 1} as done`}
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
                  {isWarned ? (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      Not marked done
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Add a set here for this exercise only, or use Done for a full round.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addSet(selectedExercise.localId)}
            >
              <Plus />
              Add set
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }

  function closeSupersetRoundForm() {
    if (isCompletingSuperset) return;
    setResultsSupersetKey(null);
    setSupersetResultDraft({});
  }

  function saveActiveSupersetRound() {
    if (!resultsSupersetKey) return;
    const firstInvalid = getSupersetMembers(
      supersets,
      selectedExercises,
      resultsSupersetKey
    ).find((exercise) => {
      const metadata = exercises.find((item) => item.id === exercise.exerciseId);
      const draft = supersetResultDraft[exercise.localId];
      return (
        !metadata ||
        !draft ||
        !hasEnteredSetPerformance(draft.set, metadata.trackingType)
      );
    });
    if (firstInvalid) {
      const name = exercises.find(
        (item) => item.id === firstInvalid.exerciseId
      )?.name;
      toast.error(`Enter results for ${name ?? "each exercise"}.`);
      return;
    }
    completeSupersetRound(resultsSupersetKey, supersetResultDraft);
  }

  function renderSupersetRoundForm() {
    return (
      <SupersetRoundForm
        entries={supersetRoundFormEntries}
        rpeTrackingEnabled={rpeTrackingEnabled}
        rpeValues={RPE_VALUES}
        isSaving={isCompletingSuperset}
        onChange={updateSupersetResult}
        onCancel={closeSupersetRoundForm}
        onSave={saveActiveSupersetRound}
      />
    );
  }

  return (
    <>
      <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-clip pb-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:pb-8">
        <section className="min-w-0 space-y-2.5 sm:space-y-4">
          {!isEditing ? (
            <MobileActiveWorkoutHeader
              restMuted={restTimer.isMuted}
              duration={workoutTimer.formattedElapsed}
              volume={
                needsBodyweightForVolume || liveVolumeKg === null
                  ? "-"
                  : formatVolumeKg(liveVolumeKg)
              }
              completedSetCount={completedSetCount}
              isSaving={isSaving}
              activeRestTimer={
                restTimer.activeTimer
                  ? {
                      exerciseName: restTimer.activeTimer.exerciseName,
                      remainingTime: formatElapsedTime(
                        restTimer.remainingSeconds
                      ),
                    }
                  : null
              }
              onToggleRestSound={toggleRestSound}
              onAddExercise={() => setIsExercisePickerOpen(true)}
              onFinish={requestFinishWorkout}
              onOpenTimerControls={() => setIsTimerSheetOpen(true)}
              onAddRestSeconds={addRestSeconds}
              onResetRestTimer={resetRestTimer}
              onSkipRestTimer={skipRestTimer}
            />
          ) : null}
          <div
                className={`sticky z-30 -mx-4 w-auto max-w-[calc(100%+2rem)] border-b bg-background/95 px-4 backdrop-blur sm:mx-0 sm:max-w-full sm:rounded-xl sm:border sm:shadow-sm ${
              isEditing
                ? "top-14 py-3"
                : "top-14 hidden py-2 md:block"
            }`}
          >
            {isEditing ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">
                    {title.trim() || "Edit Workout"}
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
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            ) : (
              <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                <div className="hidden min-w-0 flex-1 md:block">
                  <p className="truncate text-base font-semibold">
                    {title.trim() || "Workout"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-2"
                  aria-label={`Rest sounds ${restTimer.isMuted ? "muted" : "on"}`}
                  onClick={toggleRestSound}
                >
                  Rest: {restTimer.isMuted ? "Muted" : "On"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 min-w-0 flex-1 md:flex-none lg:hidden"
                  onClick={() => setIsExercisePickerOpen(true)}
                >
                  Add Exercise
                </Button>
                <Button
                  type="button"
                  className="h-9 px-3"
                  onClick={requestFinishWorkout}
                  disabled={isSaving}
                >
                  {isSaving ? "Finishing..." : "Finish"}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-3 divide-x overflow-hidden rounded-lg border bg-muted/50 text-center">
              <Sheet
                open={isTimerSheetOpen}
                onOpenChange={setIsTimerSheetOpen}
              >
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 flex-col gap-0 rounded-none px-1.5 py-1.5 font-normal"
                    aria-label={`Workout duration ${workoutTimer.formattedElapsed}. Open timer controls.`}
                  >
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      Duration
                    </span>
                    <span className="truncate font-semibold tabular-nums">
                      {workoutTimer.formattedElapsed}
                    </span>
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
              <div className="min-w-0 px-1.5 py-1.5">
                <p className="text-[11px] text-muted-foreground">Volume</p>
                <p className="truncate font-semibold">
                  {needsBodyweightForVolume || liveVolumeKg === null
                    ? "-"
                    : formatVolumeKg(liveVolumeKg)}
                </p>
              </div>
              <div className="min-w-0 px-1.5 py-1.5">
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

          {isEditing ? (
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-1.5 lg:grid-cols-[auto_auto]">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="px-2"
                onClick={toggleRestSound}
              >
                Rest: {restTimer.isMuted ? "Muted" : "On"}
              </Button>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(value as "PRIVATE" | "PUBLIC")
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto min-w-[4.5rem] px-2"
                  aria-label="Workout visibility"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                className="w-full min-w-0 lg:hidden"
                onClick={() => setIsExercisePickerOpen(true)}
              >
                Add Exercise
              </Button>
            </div>
          ) : null}

          <Sheet
            open={isExercisePickerOpen}
            onOpenChange={handleExercisePickerOpenChange}
          >
            <SheetContent
              ref={exercisePickerContentRef}
              side="bottom"
              className="h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top))] gap-0 overflow-hidden rounded-t-2xl"
              style={
                exercisePickerViewport
                  ? {
                      height: exercisePickerViewport.height,
                      maxHeight: exercisePickerViewport.height,
                      bottom: exercisePickerViewport.bottom,
                    }
                  : undefined
              }
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                exercisePickerContentRef.current?.focus({ preventScroll: true });
              }}
            >
              <SheetHeader className="shrink-0 border-b">
                <SheetTitle>
                  {exerciseToReplaceId ? "Replace exercise" : "Add Exercise"}
                </SheetTitle>
                <SheetDescription>
                  {exerciseToReplaceId
                    ? "Choose a replacement for this workout exercise."
                    : "Search and choose an exercise for this workout."}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
                {renderExercisePicker(true)}
              </div>
            </SheetContent>
          </Sheet>

          {restTimer.activeTimer ? (
            <div
              className={`sticky z-20 rounded-lg border bg-card p-3 shadow-lg ${
                isEditing
                  ? "top-[172px]"
                  : "top-[156px] hidden md:block"
              }`}
            >
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

          {isEditing ? (
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
          ) : null}

          {selectedExercises.length >= 2 ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openSupersetEditor("new")}
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
              ids={selectedExercises
                .filter(
                  (exercise) =>
                    !supersets.some((superset) =>
                      superset.exerciseLocalIds.includes(exercise.localId)
                    )
                )
                .map((exercise) => exercise.localId)}
              onMove={moveExercise}
            >
              <Accordion
                type="multiple"
                value={openExerciseIds}
                onValueChange={setOpenExerciseIds}
                className="w-full min-w-0 max-w-full space-y-2"
              >
              {[
                ...supersets
                  .map((superset) =>
                    selectedExercises.find(
                      (exercise) =>
                        exercise.localId === superset.exerciseLocalIds[0]
                    )
                  )
                  .filter(
                    (exercise): exercise is LocalWorkoutExercise =>
                      Boolean(exercise)
                  ),
                ...selectedExercises.filter(
                  (exercise) =>
                    !supersets.some((superset) =>
                      superset.exerciseLocalIds.includes(exercise.localId)
                    )
                ),
              ].map((selectedExercise, exerciseIndex) => {
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
                const superset = supersets.find(
                  (item) => item.exerciseLocalIds[0] === selectedExercise.localId
                ) ?? null;
                const supersetIndex = superset
                  ? supersets.findIndex((item) => item.key === superset.key)
                  : -1;
                const supersetMembers = superset
                  ? getSupersetMembers(supersets, selectedExercises, superset.key)
                  : [];
                const isFirstSupersetMember =
                  supersetMembers[0]?.localId === selectedExercise.localId;
                const supersetProgress = superset
                  ? getSupersetRoundProgress(
                      supersetMembers,
                      {
                        hardRoundLimit: superset.hardRoundLimit,
                        supersetKey: superset.key,
                      }
                    )
                  : null;

                if (
                  superset &&
                  supersetProgress &&
                  isFirstSupersetMember
                ) {
                  const label = getSupersetDisplayLabel(
                    superset,
                    supersetIndex
                  );
                  const exerciseNames = supersetMembers.flatMap((member) => {
                    const metadata = exercises.find(
                      (item) => item.id === member.exerciseId
                    );
                    return metadata ? [metadata.name] : [];
                  });
                  const activeRestSeconds =
                    restTimer.activeTimer?.exerciseLocalId === superset.key
                      ? restTimer.remainingSeconds
                      : null;

                  return (
                    <SupersetGroupCard
                      key={superset.key}
                      label={label}
                      colorKey={superset.colorKey}
                      exerciseNames={exerciseNames}
                      currentRound={supersetProgress.currentRound}
                      totalRounds={supersetProgress.totalRounds}
                      completedRounds={supersetProgress.completedRounds}
                      openEnded={supersetProgress.openEnded}
                      restLabel={
                        superset.restSeconds
                          ? `${superset.restSeconds} sec rest`
                          : "No rest"
                      }
                      activeRestSeconds={activeRestSeconds}
                      complete={supersetProgress.complete}
                      open={openSupersetKeys.includes(superset.key)}
                      onOpenChange={(open) =>
                        setOpenSupersetKeys((current) =>
                          open
                            ? current.includes(superset.key)
                              ? current
                              : [...current, superset.key]
                            : current.filter((key) => key !== superset.key)
                        )
                      }
                      onDone={() => openSupersetResults(superset.key)}
                      onEdit={() => openSupersetEditor(superset.key)}
                      onViewRounds={() => {
                        setOpenSupersetKeys((current) =>
                          current.includes(superset.key)
                            ? current
                            : [...current, superset.key]
                        );
                        setOpenExerciseIds((current) => [
                          ...current,
                          ...supersetMembers
                            .map((member) => member.localId)
                            .filter((id) => !current.includes(id)),
                        ]);
                      }}
                      onDissolve={() =>
                        setSupersetPendingDissolve(superset.key)
                      }
                      isSavingRound={isCompletingSuperset}
                    >
                      {supersetMembers.map((member, memberIndex) =>
                        renderSupersetExerciseRow(
                          member,
                          memberIndex,
                          label,
                          superset.key
                        )
                      )}
                    </SupersetGroupCard>
                  );
                }

                if (superset) {
                  return null;
                }

                return (
                  <SortableExerciseItem
                    key={selectedExercise.localId}
                    id={selectedExercise.localId}
                    label={exercise.name}
                  >
                    {(dragHandle) => (
                    <>
                  <AccordionItem
                    value={selectedExercise.localId}
                    className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm [overflow-anchor:none]"
                  >
                    <div className="flex min-w-0 items-stretch">
                    <AccordionTrigger className="w-full min-w-0 px-2 py-1.5 hover:no-underline">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Image
                            src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
                            alt=""
                            width={96}
                            height={96}
                            unoptimized
                            className="size-11 shrink-0 rounded-md bg-muted object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <h2
                              className="line-clamp-2 text-sm leading-tight font-semibold sm:text-base"
                              title={`${exercise.name} · ${exercise.muscle}`}
                            >
                              <span>{exercise.name}</span>
                              <span className="font-normal text-muted-foreground">
                                {" "}· {exercise.muscle}
                              </span>
                            </h2>
                          </div>
                          <span
                            className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground"
                            aria-label={`${completedSets} of ${selectedExercise.sets.length} sets completed`}
                          >
                            {completedSets}/{selectedExercise.sets.length}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <div className="flex shrink-0 items-center py-1 pr-1">
                        <ExerciseDetailPreview exercise={exercise} compact />
                        {dragHandle}
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
                              onSelect={() =>
                                openReplaceExercise(selectedExercise.localId)
                              }
                            >
                              <Repeat2 />
                              Replace exercise
                            </DropdownMenuItem>
                            {supersets.length > 0 ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  openSupersetEditor(supersets[0].key)
                                }
                              >
                                <Layers2 />
                                Add to superset
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              disabled={exerciseIndex === 0}
                              onSelect={() =>
                                moveExerciseBy(selectedExercise.localId, -1)
                              }
                            >
                              <ArrowUp />
                              Move up
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                exerciseIndex === selectedExercises.length - 1
                              }
                              onSelect={() =>
                                moveExerciseBy(selectedExercise.localId, 1)
                              }
                            >
                              <ArrowDown />
                              Move down
                            </DropdownMenuItem>
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

                    <AccordionContent className="space-y-2 border-t px-2 pt-2 pb-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Select
                          value={isCustomRest ? "custom" : String(restSeconds)}
                          onValueChange={(value) =>
                            setExerciseRestMode(selectedExercise.localId, value)
                          }
                        >
                          <SelectTrigger
                            id={`rest-${selectedExercise.localId}`}
                            size="sm"
                            className="min-w-0 px-2"
                            aria-label={`${exercise.name} rest time`}
                          >
                            <span className="text-xs text-muted-foreground">
                              Rest
                            </span>
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
                        {isCustomRest ? (
                          <Input
                            id={`custom-rest-${selectedExercise.localId}`}
                            className="h-7 w-20 min-w-0"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="3600"
                            step="5"
                            value={
                              customRestInputs[selectedExercise.localId] ??
                              String(restSeconds)
                            }
                            placeholder="Sec"
                            aria-label={`${exercise.name} custom rest seconds`}
                            onChange={(event) =>
                              setCustomRestInputs((current) => ({
                                ...current,
                                [selectedExercise.localId]: event.target.value,
                              }))
                            }
                            onBlur={(event) =>
                              commitCustomRestSeconds(
                                selectedExercise.localId,
                                event.target.value
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                          />
                        ) : null}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant={
                                selectedExercise.notes ? "secondary" : "outline"
                              }
                              className={
                                selectedExercise.notes
                                  ? "border-primary/40 text-primary"
                                  : undefined
                              }
                              aria-label={`Edit notes for ${exercise.name}`}
                            >
                              <MessageSquare />
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

                      <div className="space-y-1.5">
                        {selectedExercise.sets.map((set, setIndex) => {
                          const isWarned =
                            activeWarnedSetIds.includes(set.localId) &&
                            isIncompleteEnteredSet(
                              set,
                              exercise.trackingType
                            );
                          const warningId = `set-warning-${set.localId}`;

                          return (
                            <div
                              key={set.localId}
                              ref={(row) => {
                                if (row) {
                                  setRowRefs.current.set(set.localId, row);
                                } else {
                                  setRowRefs.current.delete(set.localId);
                                }
                              }}
                              tabIndex={isWarned ? -1 : undefined}
                              aria-describedby={
                                isWarned ? warningId : undefined
                              }
                              className={`rounded-md border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                isWarned
                                  ? "border-destructive bg-destructive/10"
                                  : set.completed
                                    ? "border-primary/40 bg-primary/10"
                                    : "border-border/70 bg-muted/20"
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
                                      getSetPlaceholder(exercise.id, setIndex, "weight", "Weight")
                                    }
                                    aria-description={getSetReferenceDescription(exercise.id, setIndex, "weight")}
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
                                    placeholder={getSetPlaceholder(exercise.id, setIndex, "reps", "Reps")}
                                    aria-description={getSetReferenceDescription(exercise.id, setIndex, "reps")}
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
                                    placeholder={getSetPlaceholder(exercise.id, setIndex, "durationSeconds", "Duration")}
                                    aria-description={getSetReferenceDescription(exercise.id, setIndex, "durationSeconds")}
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
                                    placeholder={getSetPlaceholder(exercise.id, setIndex, "distanceMeters", "Distance")}
                                    aria-description={getSetReferenceDescription(exercise.id, setIndex, "distanceMeters")}
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
                                    placeholder={getSetPlaceholder(exercise.id, setIndex, "steps", "Steps")}
                                    aria-description={getSetReferenceDescription(exercise.id, setIndex, "steps")}
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
                                    placeholder={getSetPlaceholder(exercise.id, setIndex, "floors", "Floors")}
                                    aria-description={getSetReferenceDescription(exercise.id, setIndex, "floors")}
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
                                onClick={(event) => {
                                  if (event.detail > 0) {
                                    event.currentTarget.blur();
                                  }

                                  updateSetCompleted(
                                    selectedExercise.localId,
                                    setIndex,
                                    !set.completed,
                                    exercise.name,
                                    selectedExercise.restSeconds
                                  );
                                }}
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
                            {isWarned ? (
                              <p
                                id={warningId}
                                role="status"
                                className="mt-1 flex items-center gap-1 px-1 text-xs font-medium text-destructive"
                              >
                                <AlertTriangle
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                Not marked done
                              </p>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          if (event.detail > 0) {
                            event.currentTarget.blur();
                          }

                          addSet(selectedExercise.localId);
                        }}
                      >
                        <Plus />
                        Add set
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                  </>
                    )}
                  </SortableExerciseItem>
                );
              })}
              </Accordion>
            </SortableExerciseList>
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

      {!isEditing ? (
        <Sheet
          open={isFinishSheetOpen}
          onOpenChange={(open) => {
            if (!isSaving) {
              setIsFinishSheetOpen(open);
            }
          }}
        >
          <SheetContent
            side="bottom"
            className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <SheetHeader>
              <SheetTitle>Finish workout</SheetTitle>
              <SheetDescription>
                Review your session and add any optional details.
              </SheetDescription>
            </SheetHeader>
            <form
              className="space-y-4 px-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveWorkout();
              }}
            >
              <div className="grid grid-cols-4 divide-x overflow-hidden rounded-lg border bg-muted/40 text-center">
                <div className="min-w-0 px-1 py-2">
                  <p className="text-[10px] text-muted-foreground">Duration</p>
                  <p className="truncate text-sm font-semibold tabular-nums">
                    {workoutTimer.formattedElapsed}
                  </p>
                </div>
                <div className="min-w-0 px-1 py-2">
                  <p className="text-[10px] text-muted-foreground">Sets</p>
                  <p className="text-sm font-semibold">{completedSetCount}</p>
                </div>
                <div className="min-w-0 px-1 py-2">
                  <p className="text-[10px] text-muted-foreground">Volume</p>
                  <p className="truncate text-sm font-semibold">
                    {needsBodyweightForVolume || liveVolumeKg === null
                      ? "—"
                      : formatVolumeKg(liveVolumeKg)}
                  </p>
                </div>
                <div className="min-w-0 px-1 py-2">
                  <p className="text-[10px] text-muted-foreground">Exercises</p>
                  <p className="text-sm font-semibold">
                    {selectedExercises.length}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finish-workout-title">
                  Workout title <span className="font-normal">(optional)</span>
                </Label>
                <Input
                  id="finish-workout-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={DEFAULT_WORKOUT_TITLE}
                  maxLength={140}
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  {initialWorkout
                    ? "Your routine title is pre-filled and can be edited."
                    : `Leave blank to save as “${DEFAULT_WORKOUT_TITLE}”.`}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finish-workout-notes">
                  How did the workout feel?{" "}
                  <span className="font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="finish-workout-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add a post-workout note"
                  maxLength={1000}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finish-workout-visibility">Visibility</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) =>
                    setVisibility(value as "PRIVATE" | "PUBLIC")
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger
                    id="finish-workout-visibility"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC">Public</SelectItem>
                    <SelectItem value="PRIVATE">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SheetFooter className="px-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFinishSheetOpen(false)}
                  disabled={isSaving}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Finishing..." : "Finish Workout"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}

      <Dialog
        open={supersetEditorKey !== null}
        onOpenChange={(open) => {
          if (!open) setSupersetEditorKey(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {supersetEditorKey === "new"
                ? "Create superset"
                : "Edit superset"}
            </DialogTitle>
            <DialogDescription>
              Select at least two exercises. Their normal rest timers are
              replaced by one shared rest after the full round.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {selectedExercises.map((selectedExercise) => {
                const exercise = exercises.find(
                  (item) => item.id === selectedExercise.exerciseId
                );
                if (!exercise) return null;
                const checked = supersetSelection.includes(
                  selectedExercise.localId
                );

                return (
                  <div
                    key={selectedExercise.localId}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Checkbox
                      id={`superset-exercise-${selectedExercise.localId}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        setSupersetSelection((current) =>
                          value === true
                            ? [...current, selectedExercise.localId]
                            : current.filter(
                                (id) => id !== selectedExercise.localId
                              )
                        )
                      }
                    />
                    <Label
                      htmlFor={`superset-exercise-${selectedExercise.localId}`}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate">{exercise.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {supersets.some(
                          (superset) =>
                            superset.key !== supersetEditorKey &&
                            superset.exerciseLocalIds.includes(
                              selectedExercise.localId
                            )
                        )
                          ? "Also in another superset"
                          : `${selectedExercise.sets.length} sets`}
                      </span>
                    </Label>
                    {checked ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${exercise.name} earlier`}
                          disabled={
                            supersetSelection.indexOf(
                              selectedExercise.localId
                            ) === 0
                          }
                          onClick={() =>
                            setSupersetSelection((current) => {
                              const index = current.indexOf(
                                selectedExercise.localId
                              );
                              return index > 0
                                ? arrayMove(current, index, index - 1)
                                : current;
                            })
                          }
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${exercise.name} later`}
                          disabled={
                            supersetSelection.indexOf(
                              selectedExercise.localId
                            ) ===
                            supersetSelection.length - 1
                          }
                          onClick={() =>
                            setSupersetSelection((current) => {
                              const index = current.indexOf(
                                selectedExercise.localId
                              );
                              return index >= 0 &&
                                index < current.length - 1
                                ? arrayMove(current, index, index + 1)
                                : current;
                            })
                          }
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label htmlFor="superset-shared-rest">Shared rest</Label>
              <Select
                value={
                  supersetRestSeconds === null
                    ? "off"
                    : String(supersetRestSeconds)
                }
                onValueChange={(value) =>
                  setSupersetRestSeconds(
                    value === "off" ? null : Number(value)
                  )
                }
              >
                <SelectTrigger id="superset-shared-rest" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">No shared rest timer</SelectItem>
                  {REST_SELECTOR_SECONDS.filter((seconds) => seconds > 0).map(
                    (seconds) => (
                      <SelectItem key={seconds} value={String(seconds)}>
                        {formatRestDuration(seconds)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Rest starts only after every active exercise in the round is
                completed.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSupersetEditorKey(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveSuperset}>
              {supersetEditorKey === "new"
                ? "Create superset"
                : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={resultsSupersetKey !== null && isMobileViewport}
        onOpenChange={(open) => {
          if (!open) closeSupersetRoundForm();
        }}
      >
        <SheetContent
          side="bottom"
          className="h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.75rem)] min-h-0 gap-0 overflow-hidden rounded-t-2xl"
        >
          <SheetHeader className="shrink-0 border-b pr-12">
            <SheetTitle>
              {activeResultsSuperset
                ? `${getSupersetDisplayLabel(
                    activeResultsSuperset,
                    activeResultsSupersetIndex
                  )} · Round ${activeResultsProgress?.currentRound ?? 1}`
                : "Superset round"}
            </SheetTitle>
            <SheetDescription>
              Enter the results for each exercise in this round.
            </SheetDescription>
          </SheetHeader>
          {renderSupersetRoundForm()}
        </SheetContent>
      </Sheet>

      <Dialog
        open={resultsSupersetKey !== null && !isMobileViewport}
        onOpenChange={(open) => {
          if (!open && !isCompletingSuperset) {
            setResultsSupersetKey(null);
            setSupersetResultDraft({});
          }
        }}
      >
        <DialogContent className="flex h-[min(90dvh,48rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b p-6 pr-12">
            <DialogTitle>
              {activeResultsSuperset
                ? `${getSupersetDisplayLabel(
                    activeResultsSuperset,
                    activeResultsSupersetIndex
                  )} · Round ${activeResultsProgress?.currentRound ?? 1}`
                : "Superset round"}
            </DialogTitle>
            <DialogDescription>
              Enter the results for each exercise in this round.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6 py-4 pb-6 [-webkit-overflow-scrolling:touch]">
            {resultsSupersetKey
              ? getSupersetMembers(supersets, selectedExercises, resultsSupersetKey)
                  .filter((exercise) => supersetResultDraft[exercise.localId])
                  .map((selectedExercise) => {
                    const exercise = exercises.find(
                      (item) => item.id === selectedExercise.exerciseId
                    );
                    const entry =
                      supersetResultDraft[selectedExercise.localId];
                    if (!exercise || !entry) return null;

                    return (
                      <div
                        key={selectedExercise.localId}
                        className="space-y-2 rounded-xl border p-3"
                      >
                        <div>
                          <p className="font-semibold">{exercise.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Set {entry.setNumber}
                          </p>
                        </div>
                        <div
                          className={`grid gap-2 ${getSetFieldsGridClass(
                            exercise.trackingType
                          )}`}
                        >
                          {isWeightFieldVisible(exercise.trackingType) ? (
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.5"
                              placeholder={
                                getSetPlaceholder(exercise.id, entry.setIndex, "weight", "Weight")
                              }
                              aria-description={getSetReferenceDescription(exercise.id, entry.setIndex, "weight")}
                              aria-label={`${exercise.name} weight`}
                              value={entry.set.weight ?? ""}
                              onChange={(event) =>
                                updateSupersetResult(
                                  selectedExercise.localId,
                                  "weight",
                                  event.target.value
                                )
                              }
                            />
                          ) : null}
                          {isRepsFieldVisible(exercise.trackingType) ? (
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              placeholder={getSetPlaceholder(exercise.id, entry.setIndex, "reps", "Reps")}
                              aria-description={getSetReferenceDescription(exercise.id, entry.setIndex, "reps")}
                              aria-label={`${exercise.name} reps`}
                              value={entry.set.reps ?? ""}
                              onChange={(event) =>
                                updateSupersetResult(
                                  selectedExercise.localId,
                                  "reps",
                                  event.target.value
                                )
                              }
                            />
                          ) : null}
                          {isDurationFieldVisible(exercise.trackingType) ? (
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              placeholder={getSetPlaceholder(exercise.id, entry.setIndex, "durationSeconds", "Duration")}
                              aria-description={getSetReferenceDescription(exercise.id, entry.setIndex, "durationSeconds")}
                              aria-label={`${exercise.name} duration seconds`}
                              value={entry.set.durationSeconds ?? ""}
                              onChange={(event) =>
                                updateSupersetResult(
                                  selectedExercise.localId,
                                  "durationSeconds",
                                  event.target.value
                                )
                              }
                            />
                          ) : null}
                          {isDistanceFieldVisible(exercise.trackingType) ? (
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              placeholder={getSetPlaceholder(exercise.id, entry.setIndex, "distanceMeters", "Distance")}
                              aria-description={getSetReferenceDescription(exercise.id, entry.setIndex, "distanceMeters")}
                              aria-label={`${exercise.name} distance meters`}
                              value={entry.set.distanceMeters ?? ""}
                              onChange={(event) =>
                                updateSupersetResult(
                                  selectedExercise.localId,
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
                              inputMode="numeric"
                              min="0"
                              placeholder={getSetPlaceholder(exercise.id, entry.setIndex, "steps", "Steps")}
                              aria-description={getSetReferenceDescription(exercise.id, entry.setIndex, "steps")}
                              aria-label={`${exercise.name} steps`}
                              value={entry.set.steps ?? ""}
                              onChange={(event) =>
                                updateSupersetResult(
                                  selectedExercise.localId,
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
                              inputMode="numeric"
                              min="0"
                              placeholder={getSetPlaceholder(exercise.id, entry.setIndex, "floors", "Floors")}
                              aria-description={getSetReferenceDescription(exercise.id, entry.setIndex, "floors")}
                              aria-label={`${exercise.name} floors`}
                              value={entry.set.floors ?? ""}
                              onChange={(event) =>
                                updateSupersetResult(
                                  selectedExercise.localId,
                                  "floors",
                                  event.target.value
                                )
                              }
                            />
                          ) : null}
                        </div>
                        {rpeTrackingEnabled ? (
                          <Select
                            value={
                              entry.set.rpe === null
                                ? "none"
                                : String(entry.set.rpe)
                            }
                            onValueChange={(value) =>
                              updateSupersetResult(
                                selectedExercise.localId,
                                "rpe",
                                value === "none" ? "" : value
                              )
                            }
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-label={`${exercise.name} RPE`}
                            >
                              <SelectValue placeholder="Optional RPE" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No RPE</SelectItem>
                              {RPE_VALUES.map((rpe) => (
                                <SelectItem key={rpe} value={String(rpe)}>
                                  RPE {rpe}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    );
                  })
              : null}
          </div>
          <DialogFooter className="z-10 shrink-0 border-t bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResultsSupersetKey(null)}
              disabled={isCompletingSuperset}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isCompletingSuperset}
              onClick={() => {
                if (resultsSupersetKey) {
                  completeSupersetRound(
                    resultsSupersetKey,
                    supersetResultDraft
                  );
                }
              }}
            >
              {isCompletingSuperset ? "Saving..." : "Save round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        open={showIncompleteSetsDialog}
        onOpenChange={setShowIncompleteSetsDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some sets are not marked done</AlertDialogTitle>
            <AlertDialogDescription>
              {activeWarnedSetIds.length === 1
                ? "1 entered set is not marked done."
                : `${activeWarnedSetIds.length} entered sets are not marked done.`}{" "}
              Incomplete sets are not included in workout volume.
              {incompleteEnteredSets[0] ? (
                <span className="mt-2 block text-foreground">
                  First affected: {incompleteEnteredSets[0].exerciseName}, set{" "}
                  {incompleteEnteredSets[0].setNumber}.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={finishWithIncompleteSets}>
              Finish anyway
            </AlertDialogCancel>
            <AlertDialogAction onClick={reviewIncompleteSets}>
              Review sets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingIncompatibleReplacement)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingIncompatibleReplacement(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace and reset set data?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingIncompatibleReplacement?.currentExercise.name ??
                "The current exercise"}{" "}
              and {pendingIncompatibleReplacement?.replacementExercise.name ??
                "the replacement"} use incompatible tracking formats. The
              number of sets, exercise notes, and rest time will remain, but
              entered set values, completion state, and RPE will be reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel replacement</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingIncompatibleReplacement) {
                  return;
                }

                replaceExercise(
                  pendingIncompatibleReplacement.localId,
                  pendingIncompatibleReplacement.replacementExercise,
                  false
                );
                toast.success(
                  `${pendingIncompatibleReplacement.currentExercise.name} replaced with ${pendingIncompatibleReplacement.replacementExercise.name}.`
                );
              }}
            >
              Replace and reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        open={supersetPendingDissolve !== null}
        onOpenChange={(open) => {
          if (!open) setSupersetPendingDissolve(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dissolve this superset?</AlertDialogTitle>
            <AlertDialogDescription>
              The exercises and all completed set data stay in the workout.
              Only the grouping and shared rest are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep superset</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (supersetPendingDissolve) {
                  dissolveSuperset(supersetPendingDissolve);
                }
              }}
            >
              Dissolve superset
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
