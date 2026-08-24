"use client";

import {
  type ReactNode,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
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
  Keyboard,
  Layers2,
  MessageSquare,
  ImagePlus,
  Plus,
  Repeat2,
  Timer,
  TimerReset,
  Trash2,
  Unlink2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { Keyboard as CapacitorKeyboard } from "@capacitor/keyboard";
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
import { ExerciseNoteTextarea, NoteTextarea } from "@/components/ui/note-textarea";
import { normalizeOptionalNote } from "@/lib/notes";
import { compressWorkoutPhoto } from "@/lib/workout-photo-client";
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
import { DurationInput } from "@/components/workouts/DurationInput";
import { SupersetGroupCard } from "@/components/workouts/SupersetGroupCard";
import {
  SupersetRoundForm,
  type SupersetRoundFormEntry,
} from "@/components/workouts/SupersetRoundForm";
import {
  SortableExerciseActivatorItem,
  SortableExerciseItem,
  SortableExerciseList,
  type SortableExerciseActivator,
} from "@/components/workouts/SortableExerciseList";
import { WorkoutSetSwipeDeleteAction } from "@/components/workouts/WorkoutExerciseSwipeAction";
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
  getSupersetMembershipSortableId,
  getSupersetRenderEntries,
  reorderSupersetMembershipIds,
  getSupersetRoundProgress,
  SUPERSET_COLOR_KEYS,
} from "@/lib/workout-supersets";
import {
  DEFAULT_WORKOUT_TITLE,
  getFinalWorkoutTitle,
} from "@/lib/workout-title";
import { getTrackingTypeFieldConfig } from "@/lib/exercise-tracking-fields";
import { rankExercisesForPicker } from "@/lib/exercise-picker-ranking";
import type { ExerciseUsage } from "@/lib/workout-exercise-usage";
import { dismissActiveTextInput } from "@/lib/mobile-keyboard";
import { formatDurationInput } from "@/lib/duration-input";
import {
  getExerciseTimerDisplaySeconds,
  getExerciseTimerResultSeconds,
  pauseExerciseSetTimer,
  resumeExerciseSetTimer,
  type ExerciseSetTimer,
} from "@/lib/exercise-set-timer";
import { isIOSApp, isNativePluginAvailable } from "@/lib/native/platform";
import {
  getWorkoutKeyboardBottomSpace,
  getWorkoutKeyboardScrollAdjustment,
  getWorkoutKeyboardSpacerRemovalState,
  getWorkoutKeyboardScrollTarget,
} from "@/lib/workout-keyboard";
import { endWorkoutLiveActivity, syncWorkoutLiveActivity } from "@/lib/native/workout-live-activity";
import { getAppleHealthWorkoutPayload } from "@/lib/apple-health-workout";
import { saveAppleHealthWorkout } from "@/lib/native/apple-health";
import {
  displayDistanceInputValue,
  displayDistanceToMeters,
  displayWeightInputValue,
  displayWeightToKg,
  distanceInputUnit,
  formatDistance,
  formatWeight,
  type MeasurementSystem,
  weightUnit,
} from "@/lib/measurement-units";
import {
  formatPerformanceReferenceValue,
  formatWeightedPerformance,
  getActiveSetPersonalRecordDisplay,
  getPerformanceReference,
  getPerformanceReferenceDescription,
  type ExercisePerformanceReference,
  type ExercisePerformanceReferenceMap,
  type WorkoutPerformanceMetric,
} from "@/lib/workout-performance-references";
import type {
  ExerciseListItem,
  ExerciseTrackingType,
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
  measurementSystem: MeasurementSystem;
  rpeTrackingEnabled: boolean;
  appleHealthWorkoutExportEnabled?: boolean;
  exerciseUsage: ExerciseUsage[];
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

type ActiveExerciseTimer = ExerciseSetTimer & {
  exerciseLocalId: string;
  setIndex: number;
  setLocalId: string;
};

async function playExerciseTimerCompletion() {
  if (typeof window !== "undefined") {
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextConstructor) {
      try {
        const context = new AudioContextConstructor();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = context.currentTime;
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.37);
      } catch {
        // Completion feedback is intentionally best-effort.
      }
    }
  }
  if (isNativePluginAvailable("Haptics")) {
    await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  }
}

const DEFAULT_REST_SECONDS = 90;
const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const COMPACT_WORKOUT_NUMBER_INPUT_CLASS =
  "h-8 min-w-0 rounded-md bg-background/80 px-1 text-center text-base font-semibold tabular-nums md:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const WORKOUT_TABLE_HEADER_CELL_CLASS =
  "flex min-w-0 items-center justify-center px-1 text-center";
const WORKOUT_TABLE_CELL_CLASS =
  "flex min-w-0 items-center justify-center px-1 text-center";
const WORKOUT_TABLE_VALUE_CLASS = "text-sm font-medium tabular-nums";
const ACTIVE_EXERCISE_HEADER_ROW_CLASS =
  "flex min-w-0 flex-nowrap items-start gap-2 px-0 py-2 md:px-2.5";
const isDevelopment = process.env.NODE_ENV === "development";

function logWorkoutKeyboard(event: string, detail?: unknown) {
  if (!isDevelopment) return;
  console.debug(`[WorkoutKeyboard] ${event}`, detail ?? "");
}

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

function canonicalWorkoutInputValue(
  value: string,
  metric: "weight" | "distanceMeters",
  measurementSystem: MeasurementSystem
) {
  if (value.trim() === "") return "";
  const displayValue = Number(value);
  if (!Number.isFinite(displayValue)) return value;
  return String(
    metric === "weight"
      ? displayWeightToKg(displayValue, measurementSystem)
      : displayDistanceToMeters(displayValue, measurementSystem)
  );
}

function formatTrackingTypeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
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

type SetMetricColumn = {
  metric: WorkoutPerformanceMetric;
  label: string;
  inputLabel: string;
  inputMode: "decimal" | "numeric";
  step: string;
};

function getSetMetricColumns(
  trackingType: ExerciseListItem["trackingType"],
  measurementSystem: MeasurementSystem = "METRIC"
): SetMetricColumn[] {
  const columns: SetMetricColumn[] = [];

  if (isWeightFieldVisible(trackingType)) {
    columns.push({
      metric: "weight",
      label: weightUnit(measurementSystem).toUpperCase(),
      inputLabel: `${trackingType === "WEIGHTED_BODYWEIGHT" ? "added " : ""}weight in ${measurementSystem === "IMPERIAL" ? "pounds" : "kilograms"}`,
      inputMode: "decimal",
      step: "0.5",
    });
  }
  if (isRepsFieldVisible(trackingType)) {
    columns.push({ metric: "reps", label: "REPS", inputLabel: "reps", inputMode: "numeric", step: "1" });
  }
  if (isDistanceFieldVisible(trackingType)) {
    columns.push({ metric: "distanceMeters", label: distanceInputUnit(measurementSystem).toUpperCase(), inputLabel: `distance in ${measurementSystem === "IMPERIAL" ? "miles" : "kilometers"}`, inputMode: "decimal", step: "0.01" });
  }
  if (isDurationFieldVisible(trackingType)) {
    columns.push({ metric: "durationSeconds", label: "TIME", inputLabel: "duration minutes", inputMode: "decimal", step: "0.25" });
  }
  if (trackingType === "STEPS_DISTANCE_DURATION") {
    columns.push({ metric: "steps", label: "STEPS", inputLabel: "steps", inputMode: "numeric", step: "1" });
  }
  if (trackingType === "FLOORS_DISTANCE_DURATION") {
    columns.push({ metric: "floors", label: "FLRS", inputLabel: "floors", inputMode: "numeric", step: "1" });
  }

  return columns;
}

const SET_TABLE_GRID_BY_TRACKING_TYPE: Record<
  ExerciseTrackingType,
  { withRpe: string; withoutRpe: string }
> = {
  NOT_SELECTED: {
    withRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(1.75rem,.55fr)_minmax(2.5rem,.85fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(3rem,.7fr)_minmax(4rem,.9fr)_minmax(2.5rem,.5fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(1.75rem,.55fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(3rem,.7fr)_minmax(2.5rem,.5fr)]",
  },
  BODYWEIGHT_REPS: {
    withRpe: "grid-cols-[minmax(2rem,.45fr)_minmax(4rem,1.55fr)_minmax(3rem,1.1fr)_minmax(2.25rem,.75fr)_minmax(3rem,1fr)_minmax(2rem,.55fr)] lg:grid-cols-[minmax(2.5rem,.45fr)_minmax(7rem,1.65fr)_minmax(4.5rem,1.2fr)_minmax(3rem,.85fr)_minmax(4rem,1fr)_minmax(2.5rem,.6fr)]",
    withoutRpe: "grid-cols-[minmax(2rem,.45fr)_minmax(4rem,1.55fr)_minmax(3rem,1.1fr)_minmax(2.25rem,.75fr)_minmax(2rem,.55fr)] lg:grid-cols-[minmax(2.5rem,.45fr)_minmax(7rem,1.65fr)_minmax(4.5rem,1.2fr)_minmax(3rem,.85fr)_minmax(2.5rem,.6fr)]",
  },
  WEIGHTED_BODYWEIGHT: {
    withRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(3rem,1.1fr)_minmax(2.5rem,.85fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(5rem,1.3fr)_minmax(4rem,.9fr)_minmax(2.5rem,.5fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(3rem,1.1fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(5rem,1.3fr)_minmax(2.5rem,.5fr)]",
  },
  EXTERNAL_WEIGHT: {
    withRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(3rem,1.1fr)_minmax(2.5rem,.85fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(5rem,1.3fr)_minmax(4rem,.9fr)_minmax(2.5rem,.5fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(3rem,1.1fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(5rem,1.3fr)_minmax(2.5rem,.5fr)]",
  },
  DURATION: {
    withRpe: "grid-cols-[minmax(2rem,.45fr)_minmax(4rem,1.55fr)_minmax(3rem,1.1fr)_minmax(2.25rem,.75fr)_minmax(3rem,1fr)_minmax(2rem,.55fr)] lg:grid-cols-[minmax(2.5rem,.45fr)_minmax(7rem,1.65fr)_minmax(4.5rem,1.2fr)_minmax(3rem,.85fr)_minmax(4rem,1fr)_minmax(2.5rem,.6fr)]",
    withoutRpe: "grid-cols-[minmax(2rem,.45fr)_minmax(4rem,1.55fr)_minmax(3rem,1.1fr)_minmax(2.25rem,.75fr)_minmax(2rem,.55fr)] lg:grid-cols-[minmax(2.5rem,.45fr)_minmax(7rem,1.65fr)_minmax(4.5rem,1.2fr)_minmax(3rem,.85fr)_minmax(2.5rem,.6fr)]",
  },
  DISTANCE_DURATION: {
    withRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(1.75rem,.55fr)_minmax(2.5rem,.85fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(3rem,.7fr)_minmax(4rem,.9fr)_minmax(2.5rem,.5fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.4fr)_minmax(3rem,1.2fr)_minmax(2.25rem,.8fr)_minmax(2.25rem,.85fr)_minmax(1.75rem,.55fr)_minmax(1.75rem,.45fr)] lg:grid-cols-[minmax(2.5rem,.4fr)_minmax(6rem,1.45fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(3rem,.7fr)_minmax(2.5rem,.5fr)]",
  },
  STEPS_DISTANCE_DURATION: {
    withRpe: "grid-cols-[minmax(1.75rem,.35fr)_minmax(2.5rem,1fr)_repeat(3,minmax(2rem,.7fr))_minmax(1.5rem,.45fr)_minmax(2.25rem,.75fr)_minmax(1.75rem,.4fr)] lg:grid-cols-[minmax(2.5rem,.35fr)_minmax(5rem,1.15fr)_repeat(3,minmax(3.5rem,.9fr))_minmax(3rem,.65fr)_minmax(4rem,.85fr)_minmax(2.5rem,.45fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.35fr)_minmax(2.5rem,1fr)_repeat(3,minmax(2rem,.7fr))_minmax(1.5rem,.45fr)_minmax(1.75rem,.4fr)] lg:grid-cols-[minmax(2.5rem,.35fr)_minmax(5rem,1.15fr)_repeat(3,minmax(3.5rem,.9fr))_minmax(3rem,.65fr)_minmax(2.5rem,.45fr)]",
  },
  FLOORS_DISTANCE_DURATION: {
    withRpe: "grid-cols-[minmax(1.75rem,.35fr)_minmax(2.5rem,1fr)_repeat(3,minmax(2rem,.7fr))_minmax(1.5rem,.45fr)_minmax(2.25rem,.75fr)_minmax(1.75rem,.4fr)] lg:grid-cols-[minmax(2.5rem,.35fr)_minmax(5rem,1.15fr)_repeat(3,minmax(3.5rem,.9fr))_minmax(3rem,.65fr)_minmax(4rem,.85fr)_minmax(2.5rem,.45fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.35fr)_minmax(2.5rem,1fr)_repeat(3,minmax(2rem,.7fr))_minmax(1.5rem,.45fr)_minmax(1.75rem,.4fr)] lg:grid-cols-[minmax(2.5rem,.35fr)_minmax(5rem,1.15fr)_repeat(3,minmax(3.5rem,.9fr))_minmax(3rem,.65fr)_minmax(2.5rem,.45fr)]",
  },
  WEIGHT_DISTANCE_DURATION: {
    withRpe: "grid-cols-[minmax(1.75rem,.35fr)_minmax(2.5rem,1fr)_repeat(3,minmax(2rem,.7fr))_minmax(1.5rem,.45fr)_minmax(2.25rem,.75fr)_minmax(1.75rem,.4fr)] lg:grid-cols-[minmax(2.5rem,.35fr)_minmax(5rem,1.15fr)_repeat(3,minmax(3.5rem,.9fr))_minmax(3rem,.65fr)_minmax(4rem,.85fr)_minmax(2.5rem,.45fr)]",
    withoutRpe: "grid-cols-[minmax(1.75rem,.35fr)_minmax(2.5rem,1fr)_repeat(3,minmax(2rem,.7fr))_minmax(1.5rem,.45fr)_minmax(1.75rem,.4fr)] lg:grid-cols-[minmax(2.5rem,.35fr)_minmax(5rem,1.15fr)_repeat(3,minmax(3.5rem,.9fr))_minmax(3rem,.65fr)_minmax(2.5rem,.45fr)]",
  },
};

function getSetTableGridClass(
  trackingType: ExerciseTrackingType,
  showRpeAction: boolean
) {
  return SET_TABLE_GRID_BY_TRACKING_TYPE[trackingType][
    showRpeAction ? "withRpe" : "withoutRpe"
  ];
}

// Kept for the compact superset round-entry form, which intentionally remains
// a quick-entry layout rather than the active-workout table.
function getSetRowGridClass(showRpeAction: boolean) {
  return showRpeAction
    ? "grid-cols-[1.25rem_minmax(0,1fr)_auto_auto_auto]"
    : "grid-cols-[1.25rem_minmax(0,1fr)_auto_auto]";
}

function getSetFieldsGridClass(
  trackingType: ExerciseListItem["trackingType"]
) {
  const count = getSetMetricColumns(trackingType).length;
  return count <= 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(3rem,1fr))]";
}

function formatPreviousSetPerformance(
  reference: ExercisePerformanceReference | undefined,
  trackingType: ExerciseListItem["trackingType"],
  setIndex: number
) {
  const performance = getPreviousSetPerformance(reference, trackingType, setIndex);
  return [performance.primary, performance.secondary].filter(Boolean).join(" ") || "—";
}

function getPreviousSetPerformance(
  reference: ExercisePerformanceReference | undefined,
  trackingType: ExerciseListItem["trackingType"],
  setIndex: number,
  measurementSystem: MeasurementSystem = "METRIC"
) {
  const previous = reference?.previousWorkout;
  if (!previous) return { primary: "—", secondary: null, weight: null };
  const set = previous.sets[setIndex];
  if (!set) return { primary: "—", secondary: null, weight: null };
  const values = getSetMetricColumns(trackingType).flatMap(({ metric }) => {
    const value = set[metric];
    if (typeof value !== "number" || value <= 0) return [];
    const formatted = metric === "weight"
      ? formatWeight(value, measurementSystem)
      : metric === "distanceMeters"
        ? formatDistance(value, measurementSystem)
        : formatPerformanceReferenceValue(metric, value);
    if (metric === "weight") {
      return [formatted];
    }
    if (metric === "reps") return [`${formatted} reps`];
    return [formatted];
  });

  const weightedPerformance =
    (trackingType === "EXTERNAL_WEIGHT" || trackingType === "WEIGHTED_BODYWEIGHT") &&
    typeof set.weight === "number" && set.weight > 0 &&
    typeof set.reps === "number" && set.reps > 0
      ? formatWeightedPerformance({
          weight: set.weight,
          reps: set.reps,
          measurementSystem,
        })
      : null;

  return {
    primary: weightedPerformance ?? (values.length ? values.join(" × ") : "—"),
    secondary: typeof set.rpe === "number" ? `@ ${set.rpe} RPE` : null,
    weight: typeof set.weight === "number" && set.weight > 0 ? set.weight : null,
  };
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
  trackingType: ExerciseListItem["trackingType"],
  measurementSystem: MeasurementSystem = "METRIC"
) {
  const parts: string[] = [];

  if (isWeightFieldVisible(trackingType) && set.weight !== null) {
    parts.push(formatWeight(set.weight, measurementSystem));
  }

  if (isRepsFieldVisible(trackingType) && set.reps !== null) {
    parts.push(`${set.reps} reps`);
  }

  if (isDurationFieldVisible(trackingType) && set.durationSeconds !== null) {
    parts.push(formatElapsedTime(set.durationSeconds));
  }

  if (set.distanceMeters !== null) {
    parts.push(formatDistance(set.distanceMeters, measurementSystem));
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
  measurementSystem,
  rpeTrackingEnabled,
  appleHealthWorkoutExportEnabled = false,
  exerciseUsage,
  saveMode,
}: WorkoutBuilderProps) {
  const router = useRouter();
  const isEditing = saveMode ? saveMode === "edit" : Boolean(initialWorkout);
  const [activeWorkoutSessionId, setActiveWorkoutSessionId] = useState(
    isEditing && initialWorkout?.id
      ? `edit-${initialWorkout.id}`
      : "server-active-workout"
  );
  // This is a layout synchronization signal only. The actual inset remains on
  // the scroll owner as a CSS variable so it does not participate in workout
  // data updates or per-scroll rendering.
  const [workoutKeyboardLayoutVersion, setWorkoutKeyboardLayoutVersion] =
    useState(0);
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
  const focusedWorkoutInputRef = useRef<HTMLInputElement | null>(null);
  const keyboardHeightRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const keyboardScrollRequestRef = useRef(0);
  const keyboardScrollFrameRef = useRef<number | null>(null);
  const keyboardBottomSpaceRef = useRef(0);
  const keyboardSpacerRemovalPendingRef = useRef(false);
  const loadedPerformanceReferenceIdsRef = useRef(new Set<string>());
  const completionViewportAnchorRef = useRef<{
    setLocalId: string;
    top: number;
    waitForRestTimerExerciseId: string | null;
  } | null>(null);
  const [title, setTitle] = useState(initialWorkout?.title ?? "");
  const [savedFinishWorkoutId, setSavedFinishWorkoutId] = useState<number | null>(null);
  const [notes, setNotes] = useState(initialWorkout?.notes ?? "");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">(
    initialWorkout?.visibility ?? "PUBLIC"
  );
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [trackingTypeFilter, setTrackingTypeFilter] = useState("all");
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [isPreloadingPickerHistory, setIsPreloadingPickerHistory] = useState(false);
  const [selectedExercises, setSelectedExercises] = useState<
    LocalWorkoutExercise[]
  >(initialSelectedExercises);
  const [performanceReferences, setPerformanceReferences] = useState<ExercisePerformanceReferenceMap>({});
  const [loadingPerformanceReferenceIds, setLoadingPerformanceReferenceIds] =
    useState<Set<string>>(() => new Set());
  const [durationTimerTarget, setDurationTimerTarget] = useState<{ exerciseLocalId: string; setIndex: number; setLocalId: string; exerciseName: string } | null>(null);
  const [exerciseTimer, setExerciseTimer] = useState<ActiveExerciseTimer | null>(null);
  const [exerciseTimerNowMs, setExerciseTimerNowMs] = useState(Date.now);
  const [countdownTargetSeconds, setCountdownTargetSeconds] = useState(15 * 60);
  const [pendingExerciseTimerStart, setPendingExerciseTimerStart] = useState<{ mode: ActiveExerciseTimer["mode"]; targetSeconds: number } | null>(null);
  const [showActiveTimerFinishDialog, setShowActiveTimerFinishDialog] = useState(false);
  const exerciseTimerCompletedRef = useRef<string | null>(null);
  const liveActivityStartedAtRef = useRef<number | null>(null);
  const selectedExerciseIds = useMemo(
    () => [...new Set(selectedExercises.map((exercise) => exercise.exerciseId))],
    [selectedExercises]
  );
  const liveActivityExercise = useMemo(() => {
    const selected = selectedExercises.find((item) => item.sets.some((set) => !set.completed))
      ?? selectedExercises[0];
    if (!selected) {
      return {
        name: "Workout",
        setLabel: "Ready to train",
        performance: "Add an exercise",
      };
    }
    const metadata = exercises.find((item) => item.id === selected.exerciseId);
    const setIndex = selected.sets.findIndex((set) => !set.completed);
    const set = selected.sets[setIndex >= 0 ? setIndex : 0];
    if (!metadata || !set) return null;
    return {
      name: metadata.name,
      setLabel: `Set ${Math.max(0, setIndex) + 1} of ${selected.sets.length}`,
      performance: formatSetSummary(set, metadata.trackingType, measurementSystem) || "Next set",
    };
  }, [exercises, measurementSystem, selectedExercises]);
  const [supersets, setSupersets] = useState<WorkoutSupersetInput[]>(
    initialSupersets
  );

  const preloadPerformanceReferences = useCallback(async (ids: string[]) => {
    const exerciseIds = [...new Set(ids)].filter(
      (id) => !loadedPerformanceReferenceIdsRef.current.has(id)
    );
    if (!exerciseIds.length) return;
    exerciseIds.forEach((id) => loadedPerformanceReferenceIdsRef.current.add(id));
    setLoadingPerformanceReferenceIds((current) => new Set([...current, ...exerciseIds]));
    try {
      const response = await fetch("/api/user/workout-performance-references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exerciseIds,
        excludeWorkoutId: initialWorkout && initialWorkout.id > 0 ? initialWorkout.id : undefined,
        before: isEditing ? initialWorkout?.startedAt : undefined,
      }),
      });
      if (!response.ok) throw new Error("Unable to load exercise history.");
      const payload = (await response.json()) as {
        references: ExercisePerformanceReferenceMap;
      };
      setPerformanceReferences((current) => ({ ...current, ...payload.references }));
    } catch (error) {
      exerciseIds.forEach((id) => loadedPerformanceReferenceIdsRef.current.delete(id));
      console.error("[workout-history-context]", error);
    } finally {
      setLoadingPerformanceReferenceIds((current) => {
        const next = new Set(current);
        exerciseIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [initialWorkout, isEditing]);

  useEffect(() => {
    void preloadPerformanceReferences(selectedExerciseIds);
  }, [preloadPerformanceReferences, selectedExerciseIds]);
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
  const [openSwipeSetId, setOpenSwipeSetId] = useState<string | null>(null);
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
  const [isTimerSheetOpen, setIsTimerSheetOpen] = useState(false);
  const [isFinishSheetOpen, setIsFinishSheetOpen] = useState(false);
  const finishPhotoInputRef = useRef<HTMLInputElement>(null);
  const [finishPhotos, setFinishPhotos] = useState<File[]>([]);
  const [finishPhotoError, setFinishPhotoError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
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
    () => [...new Set(exercises.flatMap((exercise) => [exercise.muscle, ...exercise.secondaryMuscles]))].sort(),
    [exercises]
  );
  const trackingTypes = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.trackingType))].sort(),
    [exercises]
  );

  const filteredExercises = useMemo(() => {
    return rankExercisesForPicker(
      exercises
      .filter(
        (exercise) =>
          (muscleFilter === "all" || exercise.muscle === muscleFilter || exercise.secondaryMuscles.includes(muscleFilter))
          && (trackingTypeFilter === "all" || exercise.trackingType === trackingTypeFilter)
      ), exerciseUsage, search
    ).slice(0, 80);
  }, [exerciseUsage, exercises, muscleFilter, search, trackingTypeFilter]);
  const getExerciseInstanceLabel = (
    localId: string,
    exerciseId: string,
    name: string
  ) => {
    const matches = selectedExercises.filter(
      (item) => item.exerciseId === exerciseId
    );
    if (matches.length < 2) return name;
    return `${name} · #${matches.findIndex((item) => item.localId === localId) + 1}`;
  };
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

  const keepFocusedWorkoutInputVisible = useCallback((requestId: number) => {
    if (requestId !== keyboardScrollRequestRef.current) return;
    const input = focusedWorkoutInputRef.current;
    const scrollOwner = document.querySelector<HTMLElement>(
      "[data-active-workout-scroll-owner]"
    );
    if (!input?.isConnected || !scrollOwner) return;

    const inputRect = input.getBoundingClientRect();
    const ownerRect = scrollOwner.getBoundingClientRect();
    const adjustedBy = getWorkoutKeyboardScrollAdjustment({
      inputTop: inputRect.top,
      inputBottom: inputRect.bottom,
      containerTop: ownerRect.top,
      containerBottom: ownerRect.bottom,
      viewportHeight: window.innerHeight,
      keyboardHeight: keyboardHeightRef.current,
    });

    const targetScrollTop = getWorkoutKeyboardScrollTarget({
      scrollTop: scrollOwner.scrollTop,
      scrollHeight: scrollOwner.scrollHeight,
      clientHeight: scrollOwner.clientHeight,
      adjustment: adjustedBy,
    });

    logWorkoutKeyboard("visibility check", {
      field: input.getAttribute("aria-label"),
      containerScrollTop: scrollOwner.scrollTop,
      inputRect: { top: inputRect.top, bottom: inputRect.bottom },
      viewportHeight: window.innerHeight,
      keyboardHeight: keyboardHeightRef.current,
      obscured: adjustedBy !== 0,
      adjustedBy,
      targetScrollTop,
    });

    if (Math.abs(targetScrollTop - scrollOwner.scrollTop) > 1) {
      scrollOwner.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    }
  }, []);

  const scheduleFocusedWorkoutInputVisibility = useCallback((afterLayout = false) => {
    const requestId = keyboardScrollRequestRef.current + 1;
    keyboardScrollRequestRef.current = requestId;
    if (keyboardScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(keyboardScrollFrameRef.current);
    }
    keyboardScrollFrameRef.current = window.requestAnimationFrame(() => {
      if (!afterLayout) {
        keyboardScrollFrameRef.current = null;
        keepFocusedWorkoutInputVisible(requestId);
        return;
      }
      // The second frame is only a layout boundary after adding the keyboard
      // spacer. It does not add a second scroll write.
      keyboardScrollFrameRef.current = window.requestAnimationFrame(() => {
        keyboardScrollFrameRef.current = null;
        keepFocusedWorkoutInputVisible(requestId);
      });
    });
  }, [keepFocusedWorkoutInputVisible]);

  const setWorkoutKeyboardBottomSpace = useCallback((keyboardHeight: number) => {
    const scrollOwner = document.querySelector<HTMLElement>(
      "[data-active-workout-scroll-owner]"
    );
    if (!scrollOwner) return;

    if (keyboardHeight > 0) {
      const bottomSpace = getWorkoutKeyboardBottomSpace(keyboardHeight);
      keyboardBottomSpaceRef.current = bottomSpace;
      keyboardSpacerRemovalPendingRef.current = false;
      scrollOwner.style.setProperty(
        "--active-workout-keyboard-bottom-space",
        `${bottomSpace}px`
      );
      logWorkoutKeyboard("bottom space applied", { keyboardHeight, bottomSpace });
      return;
    }

  }, []);

  const removeWorkoutKeyboardBottomSpace = useCallback(() => {
    const scrollOwner = document.querySelector<HTMLElement>(
      "[data-active-workout-scroll-owner]"
    );
    if (!scrollOwner) return;
    scrollOwner.style.removeProperty("--active-workout-keyboard-bottom-space");
    keyboardBottomSpaceRef.current = 0;
    keyboardSpacerRemovalPendingRef.current = false;
    logWorkoutKeyboard("bottom space removed");
  }, []);

  const removeWorkoutKeyboardBottomSpaceWhenSafe = useCallback(() => {
    const scrollOwner = document.querySelector<HTMLElement>(
      "[data-active-workout-scroll-owner]"
    );
    const keyboardBottomSpace = keyboardBottomSpaceRef.current;
    if (!scrollOwner || keyboardBottomSpace <= 0) return;

    const { maxScrollTopWithoutSpacer, canRemoveSpacer } =
      getWorkoutKeyboardSpacerRemovalState({
        scrollTop: scrollOwner.scrollTop,
        scrollHeight: scrollOwner.scrollHeight,
        clientHeight: scrollOwner.clientHeight,
        keyboardBottomSpace,
      });
    if (canRemoveSpacer) {
      removeWorkoutKeyboardBottomSpace();
      return;
    }

    // Removing now would reduce max scrollTop and visibly clamp the workout
    // downward. Keep the temporary range only until the user scrolls back
    // into the normal post-keyboard range.
    keyboardSpacerRemovalPendingRef.current = true;
    logWorkoutKeyboard("bottom space removal deferred", {
      scrollTop: scrollOwner.scrollTop,
      maxScrollTopWithoutSpacer,
    });
  }, [removeWorkoutKeyboardBottomSpace]);

  const handleWorkoutSetInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      focusedWorkoutInputRef.current = event.currentTarget;
      keyboardSpacerRemovalPendingRef.current = false;
      const inputRect = event.currentTarget.getBoundingClientRect();
      logWorkoutKeyboard("focus", {
        field: event.currentTarget.getAttribute("aria-label"),
        inputRect: { top: inputRect.top, bottom: inputRect.bottom },
        containerScrollTop: document.querySelector<HTMLElement>(
          "[data-active-workout-scroll-owner]"
        )?.scrollTop,
      });

      // The first focus must not move content before the keyboard is shown.
      // For an already-open keyboard, adjust only the workout scroller.
      if (keyboardVisibleRef.current) {
        scheduleFocusedWorkoutInputVisibility();
      }
    },
    [scheduleFocusedWorkoutInputVisibility]
  );

  const handleWorkoutSetInputBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      logWorkoutKeyboard("blur", {
        field: event.currentTarget.getAttribute("aria-label"),
        // WKWebView can emit blur while it transfers focus into the native
        // keyboard. Keep the last focused set input available for
        // keyboardDidShow; a newly focused field replaces it immediately.
        retainedForKeyboardGeometry:
          focusedWorkoutInputRef.current === event.currentTarget,
      });
    },
    []
  );

  const handleWorkoutSetInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") event.currentTarget.blur();
    },
    []
  );

  const handleWorkoutSetInputValueInput = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      // Development-only diagnostic: confirms that keyboard visibility was
      // resolved before the first editable value event, without logging the
      // user's value.
      logWorkoutKeyboard("input value event", {
        field: event.currentTarget.getAttribute("aria-label"),
      });
    },
    []
  );

  useLayoutEffect(() => {
    if (
      !isIOSApp() ||
      workoutKeyboardLayoutVersion === 0 ||
      !keyboardVisibleRef.current ||
      !focusedWorkoutInputRef.current?.isConnected
    ) {
      return;
    }

    // The CSS variable was applied before this state update. useLayoutEffect
    // gives React and the browser a committed layout boundary, then the
    // scheduler's single frame measures the real post-keyboard scroll range.
    // This deliberately replaces any dependency on the first controlled
    // input-value rerender.
    logWorkoutKeyboard("keyboard layout committed", {
      keyboardHeight: keyboardHeightRef.current,
      bottomInsetApplied: keyboardBottomSpaceRef.current,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height,
    });
    scheduleFocusedWorkoutInputVisibility();
  }, [scheduleFocusedWorkoutInputVisibility, workoutKeyboardLayoutVersion]);

  useEffect(() => {
    if (!isIOSApp()) return;

    let disposed = false;
    let showListener: { remove: () => Promise<void> } | undefined;
    let hideListener: { remove: () => Promise<void> } | undefined;

    void CapacitorKeyboard.addListener("keyboardDidShow", ({ keyboardHeight }) => {
      keyboardVisibleRef.current = true;
      keyboardHeightRef.current = keyboardHeight;
      // Body resize has settled at this point. Measuring now avoids the
      // pre-keyboard focus jump and lets the native shell keep its own frame.
      setWorkoutKeyboardBottomSpace(keyboardHeight);
      // Trigger the final measurement only after the spacer is present in a
      // committed layout. This must not wait for an input value change.
      setWorkoutKeyboardLayoutVersion((current) => current + 1);
      logWorkoutKeyboard("keyboard shown", {
        keyboardHeight,
        innerHeight: window.innerHeight,
        visualViewportHeight: window.visualViewport?.height,
        bottomInsetApplied: keyboardBottomSpaceRef.current,
      });
    }).then((listener) => {
      if (disposed) void listener.remove();
      else showListener = listener;
    });
    void CapacitorKeyboard.addListener("keyboardDidHide", () => {
      keyboardVisibleRef.current = false;
      keyboardHeightRef.current = 0;
      keyboardScrollRequestRef.current += 1;
      if (keyboardScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(keyboardScrollFrameRef.current);
        keyboardScrollFrameRef.current = null;
      }
      const scrollOwner = document.querySelector<HTMLElement>(
        "[data-active-workout-scroll-owner]"
      );
      // Stop a browser-owned smooth adjustment at its present position before
      // evaluating whether removing the spacer would clamp the scroll range.
      scrollOwner?.scrollTo({ top: scrollOwner.scrollTop, behavior: "auto" });
      // Deliberately retain the user's workout scroll position on dismissal.
      removeWorkoutKeyboardBottomSpaceWhenSafe();
      // Clear only after native keyboard geometry is no longer needed. This
      // avoids losing the input target to the transient blur iOS can emit
      // between the tap and keyboardDidShow.
      focusedWorkoutInputRef.current = null;
      logWorkoutKeyboard("keyboard hidden");
    }).then((listener) => {
      if (disposed) void listener.remove();
      else hideListener = listener;
    });

    return () => {
      disposed = true;
      if (keyboardScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(keyboardScrollFrameRef.current);
        keyboardScrollFrameRef.current = null;
      }
      removeWorkoutKeyboardBottomSpace();
      void showListener?.remove();
      void hideListener?.remove();
    };
  }, [
    removeWorkoutKeyboardBottomSpace,
    removeWorkoutKeyboardBottomSpaceWhenSafe,
    setWorkoutKeyboardBottomSpace,
  ]);

  useEffect(() => {
    const scrollOwner = document.querySelector<HTMLElement>(
      "[data-active-workout-scroll-owner]"
    );
    if (!scrollOwner) return;

    let userScrollIntent = false;
    const handleTouchStart = () => {
      userScrollIntent = true;
    };
    const handleScroll = () => {
      if (
        !userScrollIntent ||
        keyboardVisibleRef.current ||
        !keyboardSpacerRemovalPendingRef.current
      ) {
        return;
      }
      removeWorkoutKeyboardBottomSpaceWhenSafe();
    };

    scrollOwner.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    scrollOwner.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollOwner.removeEventListener("touchstart", handleTouchStart);
      scrollOwner.removeEventListener("scroll", handleScroll);
    };
  }, [removeWorkoutKeyboardBottomSpaceWhenSafe]);

  useEffect(() => {
    if (isEditing || !isIOSApp()) return;

    // Only the active workout disables UIKit's outer WKWebView focus scroll;
    // the workout's CSS overflow container remains the user/manual scroll
    // owner. Every exit path unmounts this component and restores the normal
    // native page scroll used by the rest of Calistheni.
    void CapacitorKeyboard.setScroll({ isDisabled: true })
      .then(() => {
        logWorkoutKeyboard("iOS WebView automatic scroll disabled");
      })
      .catch((error: unknown) => {
        logWorkoutKeyboard("iOS WebView scroll setup failed", String(error));
      });

    return () => {
      void CapacitorKeyboard.setScroll({ isDisabled: false })
        .then(() => logWorkoutKeyboard("iOS WebView automatic scroll restored"))
        .catch((error: unknown) => {
          logWorkoutKeyboard("iOS WebView scroll restore failed", String(error));
        });
    };
  }, [isEditing]);


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

  useEffect(() => {
    if (isEditing || !isActiveWorkoutSessionReady || !liveActivityExercise) return;
    liveActivityStartedAtRef.current ??= Date.now() - workoutTimer.elapsedSeconds * 1000;
    void syncWorkoutLiveActivity({
      workoutId: activeWorkoutSessionId,
      workoutStartedAtMs: liveActivityStartedAtRef.current,
      exerciseName: liveActivityExercise.name,
      setLabel: liveActivityExercise.setLabel,
      displayPerformance: liveActivityExercise.performance,
      completedSets: completedSetCount,
      totalSets: selectedExercises.reduce((count, exercise) => count + exercise.sets.length, 0),
      isResting: restTimer.activeTimer !== null,
      restEndsAtMs: restTimer.activeTimer?.endsAtMs ?? null,
    });
  // `workoutStartedAtMs` is captured once; timer seconds are rendered natively from that date.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkoutSessionId, completedSetCount, isActiveWorkoutSessionReady, isEditing, liveActivityExercise, restTimer.activeTimer, selectedExercises]);

  function addExercise(exerciseId: string) {
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
        workoutId: activeWorkoutSessionId,
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
                ? value
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

  function moveSupersetExercise(
    supersetKey: string,
    activeSortableId: string,
    overSortableId: string
  ) {
    setSupersets((current) =>
      current.map((superset) => {
        if (superset.key !== supersetKey) return superset;
        const activeId = superset.exerciseLocalIds.find(
          (localId) => getSupersetMembershipSortableId(supersetKey, localId) === activeSortableId
        );
        const overId = superset.exerciseLocalIds.find(
          (localId) => getSupersetMembershipSortableId(supersetKey, localId) === overSortableId
        );
        return activeId && overId
          ? { ...superset, exerciseLocalIds: reorderSupersetMembershipIds(superset.exerciseLocalIds, activeId, overId) }
          : superset;
      })
    );
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
    setExerciseTimer((current) => current?.exerciseLocalId === localId ? null : current);
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
    if (!open) dismissActiveTextInput();
    setIsExercisePickerOpen(open);

    if (!open) {
      setSearch("");
      setMuscleFilter("all");
      setTrackingTypeFilter("all");
      setPickerSelectedIds([]);
      setExerciseToReplaceId(null);
    }
  }

  function removeSet(localId: string, setIndex: number) {
    setOpenSwipeSetId(null);
    const setLocalId = selectedExercises.find((exercise) => exercise.localId === localId)?.sets[setIndex]?.localId;
    setExerciseTimer((current) => current?.setLocalId === setLocalId ? null : current);
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
              notes: value,
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
                          ? String(value)
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

    const activeTimerForSet = completed && setLocalId && exerciseTimer?.setLocalId === setLocalId
      ? exerciseTimer
      : null;

    if (activeTimerForSet) {
      const activeTimerSetLocalId = activeTimerForSet.setLocalId;
      const performedDurationSeconds = getExerciseTimerResultSeconds(
        activeTimerForSet,
        Date.now()
      );
      // A countdown target is only the full result after it reaches zero; DONE records elapsed work.
      exerciseTimerCompletedRef.current = activeTimerSetLocalId;
      setExerciseTimer(null);
      setSelectedExercises((current) => current.map((exercise) =>
        exercise.localId === localId
          ? {
              ...exercise,
              sets: exercise.sets.map((set, index) => index === setIndex
                ? { ...set, durationSeconds: performedDurationSeconds, completed: true }
                : set),
            }
          : exercise
      ));
    } else {
      updateSet(localId, setIndex, "completed", completed);
    }

    if (completed) {
      const durationSeconds = restSeconds ?? DEFAULT_REST_SECONDS;

      if (durationSeconds > 0) {
        void restTimer.initializeAudio();
        restTimer.startRestTimer({
          workoutId: activeWorkoutSessionId,
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
    void endWorkoutLiveActivity(activeWorkoutSessionId, completedSetCount, selectedExercises.reduce((count, exercise) => count + exercise.sets.length, 0));
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


  function openExerciseTimingTools(
    selectedExercise: LocalWorkoutExercise,
    exercise: ExerciseListItem
  ) {
    const activeSetIndex = exerciseTimer?.exerciseLocalId === selectedExercise.localId
      ? selectedExercise.sets.findIndex((set) => set.localId === exerciseTimer.setLocalId)
      : -1;
    const setIndex = activeSetIndex >= 0
      ? activeSetIndex
      : selectedExercise.sets.findIndex((set) => !set.completed) >= 0
        ? selectedExercise.sets.findIndex((set) => !set.completed)
        : 0;
    const set = selectedExercise.sets[setIndex];
    if (!set) return;
    setDurationTimerTarget({
      exerciseLocalId: selectedExercise.localId,
      setIndex,
      setLocalId: set.localId,
      exerciseName: exercise.name,
    });
  }

  const exerciseTimerValue = exerciseTimer
    ? getExerciseTimerDisplaySeconds(exerciseTimer, exerciseTimerNowMs)
    : 0;

  useEffect(() => {
    if (!exerciseTimer || exerciseTimer.status !== "running") return;
    const tick = window.setInterval(() => setExerciseTimerNowMs(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [exerciseTimer]);

  useEffect(() => {
    if (!exerciseTimer || exerciseTimer.mode !== "countdown" || exerciseTimer.status !== "running" || exerciseTimerValue > 0) return;
    if (exerciseTimerCompletedRef.current === exerciseTimer.setLocalId) return;
    exerciseTimerCompletedRef.current = exerciseTimer.setLocalId;
    updateSet(exerciseTimer.exerciseLocalId, exerciseTimer.setIndex, "durationSeconds", String(exerciseTimer.targetSeconds));
    void playExerciseTimerCompletion();
    setExerciseTimer((current) => current?.setLocalId === exerciseTimer.setLocalId ? { ...current, status: "paused", startedAtMs: null, accumulatedMs: current.targetSeconds * 1000 } : current);
  }, [exerciseTimer, exerciseTimerValue]);

  function beginExerciseTimer(mode: ActiveExerciseTimer["mode"], targetSeconds = 900) {
    if (!durationTimerTarget) return;
    const now = Date.now();
    exerciseTimerCompletedRef.current = null;
    setExerciseTimer({ mode, exerciseLocalId: durationTimerTarget.exerciseLocalId, setIndex: durationTimerTarget.setIndex, setLocalId: durationTimerTarget.setLocalId, startedAtMs: now, accumulatedMs: 0, targetSeconds, status: "running" });
    setExerciseTimerNowMs(now);
    setDurationTimerTarget(null);
  }

  function startExerciseTimer(mode: ActiveExerciseTimer["mode"], targetSeconds = 900) {
    if (exerciseTimer?.status === "running" && exerciseTimer.setLocalId !== durationTimerTarget?.setLocalId) {
      setPendingExerciseTimerStart({ mode, targetSeconds });
      return;
    }
    beginExerciseTimer(mode, targetSeconds);
  }

  function pauseExerciseTimer() {
    const now = Date.now();
    setExerciseTimer((current) => current?.status === "running" ? { ...current, ...pauseExerciseSetTimer(current, now) } : current);
    setExerciseTimerNowMs(now);
  }

  function resumeExerciseTimer() {
    const now = Date.now();
    setExerciseTimer((current) => current?.status === "paused" ? { ...current, ...resumeExerciseSetTimer(current, now) } : current);
    setExerciseTimerNowMs(now);
  }

  function resetExerciseTimer() {
    const now = Date.now();
    exerciseTimerCompletedRef.current = null;
    setExerciseTimer((current) => current ? { ...current, status: "paused", startedAtMs: null, accumulatedMs: 0 } : current);
    setExerciseTimerNowMs(now);
  }

  function commitExerciseTimerResult() {
    if (!exerciseTimer) return;
    const seconds = getExerciseTimerResultSeconds(exerciseTimer, exerciseTimerNowMs);
    updateSet(exerciseTimer.exerciseLocalId, exerciseTimer.setIndex, "durationSeconds", String(seconds));
    setExerciseTimer(null);
  }

  function requestFinishWorkout() {
    if (exerciseTimer?.status === "running") {
      setShowActiveTimerFinishDialog(true);
      return;
    }
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

    if (savedFinishWorkoutId !== null) {
      // The workout transaction has already committed. A retry must only retry
      // photo uploads, never create a duplicate workout.
      setIsSaving(true);
      setFinishPhotoError(null);
      try {
        setUploadProgress(`Uploading photos 0 of ${finishPhotos.length}…`);
        for (const [index, original] of finishPhotos.entries()) {
          const formData = new FormData(); formData.set("file", await compressWorkoutPhoto(original));
          const upload = await fetch(`/api/user/workouts/${savedFinishWorkoutId}/photos`, { method: "POST", body: formData });
          if (!upload.ok) throw new Error(await getApiErrorMessage(upload));
          setUploadProgress(`Uploading photos ${index + 1} of ${finishPhotos.length}…`);
        }
        router.push(`/workouts/${savedFinishWorkoutId}`); router.refresh();
      } catch (error) { setFinishPhotoError(getErrorMessage(error, "Your workout was saved, but photos could not be uploaded.")); }
      finally { setUploadProgress(null); setIsSaving(false); }
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
      notes: normalizeOptionalNote(notes),
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
          notes: normalizeOptionalNote(notes ?? ""),
          restSeconds,
          supersetKey: null,
          supersetPosition: null,
          sets: sets.map((set) => ({ ...toWorkoutSetInput(set), notes: normalizeOptionalNote(set.notes ?? "") })),
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
      if (!isEditing && appleHealthWorkoutExportEnabled) {
        const healthResult = await saveAppleHealthWorkout(
          getAppleHealthWorkoutPayload(workout.id, payload)
        );
        if (healthResult.saved) {
          await fetch(`/api/user/workouts/${workout.id}/apple-health-export`, { method: "PATCH" }).catch(() => undefined);
        } else {
          toast.message("Workout saved. Apple Health export was not completed.");
        }
      }
      if (!isEditing) {
        void endWorkoutLiveActivity(activeWorkoutSessionId, completedSetCount, selectedExercises.reduce((count, exercise) => count + exercise.sets.length, 0));
        workoutTimer.clear();
        restTimer.clearRestTimer();
        clearActiveWorkoutSessionStorage(activeWorkoutSessionId);
      }

      toast.success(isEditing ? "Workout updated." : "Workout finished.");
      if (isEditing) {
        router.push(`/workouts/${workout.id}`);
        router.refresh();
      } else {
        if (finishPhotos.length) {
          try {
            setSavedFinishWorkoutId(workout.id);
            setUploadProgress(`Uploading photos 0 of ${finishPhotos.length}…`);
            for (const [index, original] of finishPhotos.entries()) {
              const compressed = await compressWorkoutPhoto(original);
              const formData = new FormData();
              formData.set("file", compressed);
              const upload = await fetch(`/api/user/workouts/${workout.id}/photos`, { method: "POST", body: formData });
              if (!upload.ok) throw new Error(await getApiErrorMessage(upload));
              setUploadProgress(`Uploading photos ${index + 1} of ${finishPhotos.length}…`);
            }
            router.push(`/workouts/${workout.id}`);
            router.refresh();
          } catch (uploadError) {
            // Saving the workout is intentionally never rolled back; retain the
            // original files so the existing completion dialog can retry them.
            setFinishPhotoError(getErrorMessage(uploadError, "Your workout was saved, but photos could not be uploaded."));
            // Keep the finish sheet and its selected files open for a retry.
          } finally { setUploadProgress(null); }
        } else {
          router.push(`/workouts/${workout.id}`);
          router.refresh();
        }
      }
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

  function addFinishPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files);
    const unsupported = next.find((file) => { const extension = file.name.split(".").pop()?.toLowerCase(); const declared = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "", "application/octet-stream"].includes(file.type); return !declared || file.size > 15 * 1024 * 1024 || (file.type === "application/octet-stream" && extension && !["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension)); });
    if (unsupported) { setFinishPhotoError("Use JPEG, PNG, WebP, HEIC, or HEIF images up to 15 MB."); return; }
    const available = 10 - finishPhotos.length;
    if (next.length > available) setFinishPhotoError(`Only ${available} more photo${available === 1 ? "" : "s"} can be added.`);
    setFinishPhotos((current) => [...current, ...next.slice(0, available)]);
  }

  async function addSelectedExercises() {
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    if (exerciseToReplaceId) {
      const replacement = byId.get(pickerSelectedIds[0]);
      if (replacement) selectExercise(replacement);
      return;
    }
    setIsPreloadingPickerHistory(true);
    await preloadPerformanceReferences(pickerSelectedIds);
    setIsPreloadingPickerHistory(false);
    pickerSelectedIds.forEach(addExercise);
    handleExercisePickerOpenChange(false);
  }

  const clearExerciseFilters = () => {
    setMuscleFilter("all");
    setTrackingTypeFilter("all");
  };

  function renderExercisePicker(keyboardSafe = false) {
    return (
      <div
        className={
          keyboardSafe
            ? "flex min-h-0 flex-1 flex-col gap-3"
            : "space-y-4"
        }
      >
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={muscleFilter} onValueChange={setMuscleFilter}>
            <SelectTrigger className="min-w-32" aria-label="Filter muscle"><SelectValue placeholder="All Muscles" /></SelectTrigger>
            <SelectContent container={exercisePickerContentRef.current}><SelectItem value="all">All Muscles</SelectItem>{muscles.map((muscle) => <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={trackingTypeFilter} onValueChange={setTrackingTypeFilter}>
            <SelectTrigger className="min-w-28" aria-label="Filter tracking type"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent container={exercisePickerContentRef.current}><SelectItem value="all">All Types</SelectItem>{trackingTypes.map((trackingType) => <SelectItem key={trackingType} value={trackingType}>{formatTrackingTypeLabel(trackingType)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div
          className={
            keyboardSafe
              ? "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
              : "max-h-[65dvh] space-y-2 overflow-y-auto pr-1"
          }
        >
          {!search.trim() && !exerciseToReplaceId && exerciseUsage.length ? <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most used</p> : null}
          {filteredExercises.map((exercise) => {
            const existingOccurrenceCount = selectedExercises.filter(
              (item) => item.exerciseId === exercise.id
            ).length;
            const isCurrentExercise = selectedExercises.some(
              (item) =>
                item.localId === exerciseToReplaceId &&
                item.exerciseId === exercise.id
            );
            const unavailable = isCurrentExercise;
            const selected = pickerSelectedIds.includes(exercise.id);

            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => exerciseToReplaceId ? setPickerSelectedIds([exercise.id]) : setPickerSelectedIds((current) => current.includes(exercise.id) ? current.filter((id) => id !== exercise.id) : [...current, exercise.id])}
                disabled={unavailable}
                className={`flex min-h-16 w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-primary bg-primary/5" : ""}`}
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
                    {exercise.muscle} · {formatTrackingTypeLabel(exercise.trackingType)}
                  </span>
                  {existingOccurrenceCount > 0 && !exerciseToReplaceId ? (
                    <span className="block text-xs text-muted-foreground">
                      {existingOccurrenceCount} already in workout
                    </span>
                  ) : null}
                  {exercise.createdByUserId ? (
                    <Badge variant="outline" className="ml-2">
                      Custom
                    </Badge>
                  ) : null}
                </span>
                <span role="checkbox" aria-checked={selected} className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>{selected ? <CheckCircle2 className="size-4" /> : null}</span>
              </button>
            );
          })}
          {search.trim() && filteredExercises.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground"><p>No exercises match these filters.</p><Button className="mt-3" variant="outline" onClick={clearExerciseFilters}>Clear filters</Button></div>
          ) : null}
        </div>
        <div className={`shrink-0 border-t py-3 ${keyboardSafe ? "pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : "mt-3"}`}><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground" aria-live="polite">{pickerSelectedIds.length} selected</span><Button disabled={!pickerSelectedIds.length || isPreloadingPickerHistory} onClick={() => void addSelectedExercises()}>{isPreloadingPickerHistory ? "Preparing…" : exerciseToReplaceId ? "Replace exercise" : `Add ${pickerSelectedIds.length} Exercise${pickerSelectedIds.length === 1 ? "" : "s"}`}</Button></div></div>
      </div>
    );
  }

  function renderExerciseThumbnailDetailsTrigger(exercise: ExerciseListItem) {
    return (
      <ExerciseDetailPreview
        exercise={exercise}
        trigger={
          <Button
            type="button"
            variant="ghost"
            className="size-11 shrink-0 rounded-md p-0 focus-visible:ring-2"
            aria-label={`View details for ${exercise.name}`}
          >
            <Image
              src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
              alt=""
              width={96}
              height={96}
              unoptimized
              className="size-11 rounded-md bg-muted object-cover"
            />
          </Button>
        }
      />
    );
  }

  function renderExerciseSetTable(
    selectedExercise: LocalWorkoutExercise,
    exercise: ExerciseListItem
  ) {
    const metricColumns = getSetMetricColumns(exercise.trackingType, measurementSystem);
    const reference = performanceReferences[exercise.id];

    return (
      <div className="space-y-1" role="group" aria-label={`${exercise.name} sets`}>
        <div
          className={`grid w-full min-w-0 items-center gap-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px] ${getSetTableGridClass(exercise.trackingType, rpeTrackingEnabled)}`}
          aria-hidden="true"
        >
          <span className={WORKOUT_TABLE_HEADER_CELL_CLASS}>Set</span>
          <span className={WORKOUT_TABLE_HEADER_CELL_CLASS}>
            <span className="lg:hidden">Prev</span>
            <span className="hidden lg:inline">Previous</span>
          </span>
          {metricColumns.map((column) => (
            <span key={column.metric} className={WORKOUT_TABLE_HEADER_CELL_CLASS}>
              <span className="lg:hidden">{column.label}</span>
              <span className="hidden lg:inline">
                {column.metric === "weight" ? "Weight" : column.label}
              </span>
            </span>
          ))}
          <span className={WORKOUT_TABLE_HEADER_CELL_CLASS}>PR</span>
          {rpeTrackingEnabled ? <span className={WORKOUT_TABLE_HEADER_CELL_CLASS}>RPE</span> : null}
          <span className={WORKOUT_TABLE_HEADER_CELL_CLASS}>
            <span className="lg:hidden">Done</span>
            <span className="hidden lg:inline">Completed</span>
          </span>
        </div>
        {selectedExercise.sets.map((set, setIndex) => {
          const isWarned = activeWarnedSetIds.includes(set.localId) && isIncompleteEnteredSet(set, exercise.trackingType);
          const warningId = `set-warning-${set.localId}`;
          const previous = getPreviousSetPerformance(
            reference,
            exercise.trackingType,
            setIndex,
            measurementSystem
          );
          const pr = getActiveSetPersonalRecordDisplay({
            context: reference?.personalRecordContext,
            trackingType: exercise.trackingType,
            set,
            previousWeight: previous.weight,
            measurementSystem,
          });

          return (
            <WorkoutSetSwipeDeleteAction
              key={set.localId}
              setLabel={`${exercise.name} set ${setIndex + 1}`}
              disabled={selectedExercise.sets.length <= 1}
              isOpen={openSwipeSetId === set.localId}
              onOpenChange={(open) =>
                setOpenSwipeSetId(open ? set.localId : null)
              }
              onDelete={() => removeSet(selectedExercise.localId, setIndex)}
            >
              <div
                ref={(row) => { if (row) setRowRefs.current.set(set.localId, row); else setRowRefs.current.delete(set.localId); }}
                tabIndex={isWarned ? -1 : undefined}
                aria-describedby={isWarned ? warningId : undefined}
                className={`group border-y px-0 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-md md:border md:p-1 ${isWarned ? "border-destructive bg-destructive/10" : set.completed ? "border-primary/40 bg-primary/10" : "border-transparent bg-transparent md:border-border/70 md:bg-muted/20"}`}
              >
                <div className={`grid w-full min-w-0 items-center gap-1 ${getSetTableGridClass(exercise.trackingType, rpeTrackingEnabled)}`}>
                <span className={`relative ${WORKOUT_TABLE_CELL_CLASS} ${WORKOUT_TABLE_VALUE_CLASS} gap-0.5 text-muted-foreground`} aria-label={`Set ${setIndex + 1}${set.completed ? ", completed" : ""}`}>
                  {setIndex + 1}
                </span>
                <span className={`${WORKOUT_TABLE_CELL_CLASS} flex-col leading-tight`} title={formatPreviousSetPerformance(reference, exercise.trackingType, setIndex)}>
                  <span className={`truncate ${WORKOUT_TABLE_VALUE_CLASS} text-foreground`}>{previous.primary}</span>
                  {previous.secondary ? <span className="truncate text-xs text-muted-foreground">{previous.secondary}</span> : null}
                </span>
                {metricColumns.map((column) => {
                  const value = set[column.metric];
                  const description = getSetReferenceDescription(exercise.id, setIndex, column.metric);
                  const activeForThisSet = exerciseTimer?.setLocalId === set.localId;
                  if (column.metric === "durationSeconds") {
                    return (
                      <div key={column.metric} className="min-w-0">
                        {activeForThisSet ? <Input className={`${COMPACT_WORKOUT_NUMBER_INPUT_CLASS} w-full min-w-0`} type="text" readOnly value={formatDurationInput(exerciseTimerValue)} aria-label={`${exercise.name} set ${setIndex + 1} active duration`} /> : <DurationInput data-workout-set-input className={`${COMPACT_WORKOUT_NUMBER_INPUT_CLASS} w-full min-w-0`} placeholder="00:00" aria-description={description} aria-label={`${exercise.name} set ${setIndex + 1} duration in minutes and seconds`} durationSeconds={set.durationSeconds} onDurationChange={(seconds) => updateSet(selectedExercise.localId, setIndex, "durationSeconds", String(seconds))} onFocus={handleWorkoutSetInputFocus} onBlur={handleWorkoutSetInputBlur} onKeyDown={handleWorkoutSetInputKeyDown} onInput={handleWorkoutSetInputValueInput} />}
                      </div>
                    );
                  }
                  return (
                    <Input
                      key={column.metric}
                      className={`${COMPACT_WORKOUT_NUMBER_INPUT_CLASS} w-full max-w-28 justify-self-center`}
                      type="number"
                      inputMode={column.inputMode}
                      min="0"
                      step={column.step}
                      placeholder=""
                      aria-description={description}
                      aria-label={`${exercise.name} set ${setIndex + 1} ${column.inputLabel}`}
                      data-workout-set-input
                      value={column.metric === "weight" ? displayWeightInputValue(set.weight, measurementSystem) : column.metric === "distanceMeters" ? displayDistanceInputValue(set.distanceMeters, measurementSystem) : value ?? ""}
                      onChange={(event) => column.metric === "weight" || column.metric === "distanceMeters" ? updateSet(selectedExercise.localId, setIndex, column.metric, canonicalWorkoutInputValue(event.target.value, column.metric, measurementSystem)) : updateSet(selectedExercise.localId, setIndex, column.metric, event.target.value)}
                      onFocus={handleWorkoutSetInputFocus}
                      onBlur={handleWorkoutSetInputBlur}
                      onKeyDown={handleWorkoutSetInputKeyDown}
                      onInput={handleWorkoutSetInputValueInput}
                    />
                  );
                })}
                <span className={WORKOUT_TABLE_CELL_CLASS} aria-label={pr?.isNew ? "New personal record" : pr?.label ?? "No personal record for this value"} title={pr?.label}>
                  {loadingPerformanceReferenceIds.has(exercise.id) ? <span className="h-4 w-8 animate-pulse rounded bg-muted" aria-label="Loading personal record" /> : pr?.isNew ? <span className="flex min-w-0 flex-col items-center leading-tight"><Badge className="h-4 px-1 text-[9px]">NEW PR</Badge>{pr.newValue ? <span className="truncate text-xs font-medium tabular-nums text-primary">{pr.newValue}</span> : null}</span> : pr?.value ? <span className={`${WORKOUT_TABLE_VALUE_CLASS} text-primary`}>{pr.value}</span> : <span className="text-sm tabular-nums text-muted-foreground">—</span>}
                </span>
                {rpeTrackingEnabled ? (
                  <span className={WORKOUT_TABLE_CELL_CLASS}>
                    <Button type="button" size="sm" variant={set.rpe ? "secondary" : "outline"} className={set.rpe ? "h-8 w-full border-primary/40 bg-primary/10 px-1 text-sm font-medium text-primary tabular-nums shadow-none" : "h-8 w-full px-1 text-sm font-medium"} aria-label={set.rpe ? `Edit set ${setIndex + 1} RPE, currently ${set.rpe}` : `Set RPE for set ${setIndex + 1}`} onClick={() => setActiveRpeTarget({ localId: selectedExercise.localId, setIndex, exerciseName: exercise.name, summary: formatSetSummary(set, exercise.trackingType), value: set.rpe })}>{set.rpe ?? "RPE"}</Button>
                  </span>
                ) : null}
                <span className={WORKOUT_TABLE_CELL_CLASS}>
                  <Button type="button" size="icon" variant={set.completed ? "secondary" : "outline"} className={`size-8 ${set.completed ? "border-primary/40 bg-primary text-primary-foreground shadow-none" : ""}`} aria-label={set.completed ? `Mark set ${setIndex + 1} incomplete` : `Mark set ${setIndex + 1} complete`} aria-pressed={set.completed} onClick={(event) => { if (event.detail > 0) event.currentTarget.blur(); updateSetCompleted(selectedExercise.localId, setIndex, !set.completed, exercise.name, selectedExercise.restSeconds); }}>{set.completed ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}</Button>
                </span>
              </div>
              {isWarned ? <p id={warningId} role="status" className="mt-1 flex items-center gap-1 px-1 text-xs font-medium text-destructive"><AlertTriangle className="size-3.5" aria-hidden="true" />Not marked done</p> : null}
              </div>
            </WorkoutSetSwipeDeleteAction>
          );
        })}
      </div>
    );
  }

  function renderSupersetExerciseRow(
    selectedExercise: LocalWorkoutExercise,
    groupPosition: number,
    supersetLabel: string,
    supersetKey: string,
    dragActivator: SortableExerciseActivator
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
        <div className={ACTIVE_EXERCISE_HEADER_ROW_CLASS}>
          {renderExerciseThumbnailDetailsTrigger(exercise)}
          <div
            {...dragActivator.attributes}
            {...dragActivator.listeners}
            className="min-w-0 flex-1 cursor-grab touch-pan-y select-none text-left active:cursor-grabbing"
            aria-label={`Reorder ${dragActivator.label}`}
            data-exercise-drag-activator
            onContextMenu={(event) => event.preventDefault()}
          >
                <div className="flex min-w-0 items-start gap-1.5">
                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 px-1.5 text-[10px]"
                  >
                    {supersetLabel.replace("Superset ", "")}
                    {groupPosition + 1}
                  </Badge>
                  <h3 className="min-w-0 flex-1 break-words text-sm leading-tight font-semibold text-primary line-clamp-3 min-[375px]:line-clamp-2">
                    {getExerciseInstanceLabel(selectedExercise.localId, exercise.id, exercise.name)}
                  </h3>
                </div>
                <p className="truncate text-xs leading-tight text-muted-foreground">
                  {exercise.muscle} · {formatTrackingTypeLabel(exercise.trackingType)}
                </p>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-0.5 whitespace-nowrap">
            <span
              className="min-w-7 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground"
              aria-label={`${completedSets} of ${selectedExercise.sets.length} sets completed`}
            >
              {completedSets}/{selectedExercise.sets.length}
            </span>
            <div className="size-10 shrink-0">
              <AccordionTrigger
                className="size-10 min-w-10 flex-none justify-center gap-0 p-0 hover:no-underline"
                aria-label={`Toggle ${exercise.name}`}
              >
                <span className="sr-only">Toggle {exercise.name}</span>
              </AccordionTrigger>
            </div>
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
        <AccordionContent className="space-y-2 bg-transparent px-0 pt-1 pb-3 md:border-t md:border-border/60 md:bg-muted/15 md:px-3 md:pt-2 md:pl-4">
          <div className="flex items-center justify-end gap-1.5">
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
                  <ExerciseNoteTextarea
                    id={`exercise-notes-${selectedExercise.localId}`}
                    value={selectedExercise.notes ?? ""}
                    onChange={(event) =>
                      updateExerciseNotes(
                        selectedExercise.localId,
                        event.target.value
                      )
                    }
                    placeholder="Optional note"
                  />
                </div>
              </PopoverContent>
            </Popover>
            {isDurationFieldVisible(exercise.trackingType) ? (
              <Button
                type="button"
                size="icon"
                variant={exerciseTimer?.exerciseLocalId === selectedExercise.localId ? "secondary" : "outline"}
                className={exerciseTimer?.exerciseLocalId === selectedExercise.localId ? "border-primary/40 text-primary" : undefined}
                aria-label={`Open timing tools for ${exercise.name}`}
                onClick={() => openExerciseTimingTools(selectedExercise, exercise)}
              >
                {exerciseTimer?.exerciseLocalId === selectedExercise.localId && exerciseTimer.status === "running" ? <Timer className="animate-pulse" /> : <Timer />}
              </Button>
            ) : null}
          </div>
          <div className="hidden" aria-hidden="true">
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
          {renderExerciseSetTable(selectedExercise, exercise)}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => addSet(selectedExercise.localId)}
          >
            <Plus />
            Add set
          </Button>
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
      <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-clip pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:pb-8">
        <section className="min-w-0 space-y-1 md:space-y-4">
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
                  size="icon"
                  variant="outline"
                  className="size-9"
                  aria-label={restTimer.isMuted ? "Enable rest timer sound" : "Mute rest timer sound"}
                  onClick={toggleRestSound}
                >
                  {restTimer.isMuted ? <VolumeX /> : <Volume2 />}
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
                size="icon"
                variant="outline"
                className="size-8"
                aria-label={restTimer.isMuted ? "Enable rest timer sound" : "Mute rest timer sound"}
                onClick={toggleRestSound}
              >
                {restTimer.isMuted ? <VolumeX /> : <Volume2 />}
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
              className="h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden rounded-none p-0 sm:h-[min(94dvh,52rem)] sm:max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] sm:rounded-t-2xl"
              showCloseButton={false}
            >
              <SheetHeader className="relative shrink-0 border-b px-4 py-3">
                <Button type="button" variant="ghost" className="absolute left-2 top-2 min-h-11 px-2" onClick={() => handleExercisePickerOpenChange(false)}>Cancel</Button>
                <SheetTitle className="text-center">{exerciseToReplaceId ? "Replace exercise" : "Add Exercise"}</SheetTitle>
                <SheetDescription className="sr-only">Search, filter, and select exercises for this workout.</SheetDescription>
                {!exerciseToReplaceId ? <Button asChild type="button" variant="ghost" className="absolute right-2 top-2 min-h-11 px-2"><Link href="/exercises/custom/new">Create</Link></Button> : null}
              </SheetHeader>
              <div data-keyboard-dismiss-on-scroll className="flex min-h-0 flex-1 flex-col px-4 pt-3">
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
                    <NoteTextarea
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
            <div className="flex justify-end py-0.5 md:py-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 md:h-9"
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
              onDragStart={() => setOpenSwipeSetId(null)}
            >
              <Accordion
                type="multiple"
                value={openExerciseIds}
                onValueChange={setOpenExerciseIds}
                className="w-full min-w-0 max-w-full space-y-0 md:space-y-2"
              >
              {getSupersetRenderEntries(supersets, selectedExercises).map((entry) => {
                const selectedExercise = entry.exercise;
                const exerciseIndex = selectedExercises.findIndex(
                  (item) => item.localId === selectedExercise.localId
                );
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
                const superset = entry.kind === "superset" ? entry.superset : null;
                const supersetIndex = superset
                  ? supersets.findIndex((item) => item.key === superset.key)
                  : -1;
                const supersetMembers = superset
                  ? getSupersetMembers(supersets, selectedExercises, superset.key)
                  : [];
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
                  supersetProgress
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
                      key={entry.key}
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
                      <SortableExerciseList
                        ids={supersetMembers.map((member) => getSupersetMembershipSortableId(superset.key, member.localId))}
                        onMove={(activeId, overId) => moveSupersetExercise(superset.key, activeId, overId)}
                        onDragStart={() => setOpenSwipeSetId(null)}
                      >
                        <Accordion type="multiple" value={openExerciseIds} onValueChange={setOpenExerciseIds}>
                          {supersetMembers.map((member, memberIndex) => {
                            const memberExercise = exercises.find((item) => item.id === member.exerciseId);
                            if (!memberExercise) return null;
                            return <SortableExerciseActivatorItem key={member.localId} id={getSupersetMembershipSortableId(superset.key, member.localId)} label={`${memberExercise.name} in ${label}`}>
                              {(dragActivator) => renderSupersetExerciseRow(member, memberIndex, label, superset.key, dragActivator)}
                            </SortableExerciseActivatorItem>;
                          })}
                        </Accordion>
                      </SortableExerciseList>
                    </SupersetGroupCard>
                  );
                }

                if (superset) {
                  return null;
                }

                return (
                  <SortableExerciseActivatorItem
                    key={entry.key}
                    id={selectedExercise.localId}
                    label={getExerciseInstanceLabel(selectedExercise.localId, exercise.id, exercise.name)}
                  >
                    {(dragActivator) => (
                  <AccordionItem
                    value={selectedExercise.localId}
                    className="relative w-full max-w-full border-b border-border/70 bg-transparent pb-1 [overflow-anchor:none] md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:pb-0 md:shadow-sm md:last:border-b"
                  >
                    <div className={ACTIVE_EXERCISE_HEADER_ROW_CLASS}>
                    {renderExerciseThumbnailDetailsTrigger(exercise)}
                    <div
                      {...dragActivator.attributes}
                      {...dragActivator.listeners}
                      className="min-w-0 flex-1 cursor-grab touch-pan-y select-none text-left active:cursor-grabbing"
                      aria-label={`Reorder ${dragActivator.label}`}
                      data-exercise-drag-activator
                      onContextMenu={(event) => event.preventDefault()}
                    >
                            <h2
                              className="break-words text-sm leading-tight font-semibold text-primary line-clamp-3 min-[375px]:line-clamp-2 sm:text-base"
                              title={`${exercise.name} · ${exercise.muscle}`}
                            >
                              {getExerciseInstanceLabel(selectedExercise.localId, exercise.id, exercise.name)}
                            </h2>
                            <p className="truncate text-xs leading-tight text-muted-foreground">
                              {exercise.muscle} · {formatTrackingTypeLabel(exercise.trackingType)}
                            </p>
                    </div>
                      <div className="flex shrink-0 flex-nowrap items-center gap-0.5 whitespace-nowrap">
                        <span
                          className="min-w-7 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground"
                          aria-label={`${completedSets} of ${selectedExercise.sets.length} sets completed`}
                        >
                          {completedSets}/{selectedExercise.sets.length}
                        </span>
                        <div className="size-10 shrink-0">
                          <AccordionTrigger
                            className="size-10 min-w-10 flex-none justify-center gap-0 p-0 hover:no-underline"
                            aria-label={`Toggle ${exercise.name}`}
                          >
                            <span className="sr-only">Toggle {exercise.name}</span>
                          </AccordionTrigger>
                        </div>
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

                    <AccordionContent className="space-y-2 px-0 pt-1 pb-3 md:border-t md:px-2 md:pt-2 md:pb-2">
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
                              <ExerciseNoteTextarea
                                id={`exercise-notes-${selectedExercise.localId}`}
                                value={selectedExercise.notes ?? ""}
                                onChange={(event) =>
                                  updateExerciseNotes(
                                    selectedExercise.localId,
                                    event.target.value
                                  )
                                }
                                placeholder="Optional note"
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
                        {isDurationFieldVisible(exercise.trackingType) ? (
                          <Button
                            type="button"
                            size="icon"
                            variant={exerciseTimer?.exerciseLocalId === selectedExercise.localId ? "secondary" : "outline"}
                            className={exerciseTimer?.exerciseLocalId === selectedExercise.localId ? "border-primary/40 text-primary" : undefined}
                            aria-label={`Open timing tools for ${exercise.name}`}
                            onClick={() => openExerciseTimingTools(selectedExercise, exercise)}
                          >
                            {exerciseTimer?.exerciseLocalId === selectedExercise.localId && exerciseTimer.status === "running" ? <Timer className="animate-pulse" /> : <Timer />}
                          </Button>
                        ) : null}
                      </div>

                      <div className="hidden" aria-hidden="true">
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
                      {renderExerciseSetTable(selectedExercise, exercise)}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
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
                    )}
                  </SortableExerciseActivatorItem>
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
                <NoteTextarea
                  id="finish-workout-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add a post-workout note"
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div>
                  <Label>Workout photos <span className="font-normal">(optional)</span></Label>
                  <p className="text-xs text-muted-foreground">Add progress photos or pictures from this session.</p>
                </div>
                <input ref={finishPhotoInputRef} className="sr-only" id="finish-workout-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => addFinishPhotos(event.target.files)} />
                {finishPhotos.length ? <div className="grid grid-cols-4 gap-2">{finishPhotos.map((file, index) => <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-md border"><Image src={URL.createObjectURL(file)} alt={`Selected workout photo ${index + 1}`} fill sizes="96px" className="object-cover" /><Button type="button" variant="secondary" size="icon-sm" className="absolute right-1 top-1" aria-label={`Remove selected workout photo ${index + 1}`} onClick={() => setFinishPhotos((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div>)}</div> : null}
                <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{finishPhotos.length} of 10 selected</p><Button type="button" variant="outline" size="sm" disabled={isSaving || finishPhotos.length >= 10} onClick={() => finishPhotoInputRef.current?.click()}><ImagePlus /> Add photos</Button></div>
                {finishPhotoError ? <p className="text-sm text-destructive" role="alert">{finishPhotoError}</p> : null}
                {uploadProgress ? <p className="text-sm text-muted-foreground" aria-live="polite">{uploadProgress}</p> : null}
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
                  {isSaving ? (uploadProgress ?? "Finishing...") : savedFinishWorkoutId !== null ? "Retry photo upload" : "Finish Workout"}
                </Button>
                {savedFinishWorkoutId !== null ? <Button type="button" variant="ghost" disabled={isSaving} onClick={() => { router.push(`/workouts/${savedFinishWorkoutId}`); router.refresh(); }}>Continue without photos</Button> : null}
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
            <SortableExerciseList
              ids={supersetSelection.map((localId) => getSupersetMembershipSortableId(supersetEditorKey ?? "new", localId))}
              onMove={(activeId, overId) => {
                const key = supersetEditorKey ?? "new";
                const activeLocalId = supersetSelection.find((localId) => getSupersetMembershipSortableId(key, localId) === activeId);
                const overLocalId = supersetSelection.find((localId) => getSupersetMembershipSortableId(key, localId) === overId);
                if (activeLocalId && overLocalId) setSupersetSelection((current) => reorderSupersetMembershipIds(current, activeLocalId, overLocalId));
              }}
            >
            <div className="space-y-2">
              {[
                ...supersetSelection.map((id) => selectedExercises.find((exercise) => exercise.localId === id)).filter((exercise): exercise is LocalWorkoutExercise => Boolean(exercise)),
                ...selectedExercises.filter((exercise) => !supersetSelection.includes(exercise.localId)),
              ].map((selectedExercise) => {
                const exercise = exercises.find(
                  (item) => item.id === selectedExercise.exerciseId
                );
                if (!exercise) return null;
                const checked = supersetSelection.includes(
                  selectedExercise.localId
                );

                const row = (dragHandle: ReactNode) => (
                  <div
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
                      <span className="block truncate">{getExerciseInstanceLabel(selectedExercise.localId, exercise.id, exercise.name)}</span>
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
                    {checked ? dragHandle : null}
                  </div>
                );
                return checked ? (
                  <SortableExerciseItem key={selectedExercise.localId} id={getSupersetMembershipSortableId(supersetEditorKey ?? "new", selectedExercise.localId)} label={`${getExerciseInstanceLabel(selectedExercise.localId, exercise.id, exercise.name)} in ${supersetEditorKey === "new" ? "new superset" : "this superset"}`}>
                    {row}
                  </SortableExerciseItem>
                ) : <div key={selectedExercise.localId}>{row(null)}</div>;
              })}
            </div>
            </SortableExerciseList>
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

      <Dialog
        open={durationTimerTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDurationTimerTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set duration</DialogTitle>
            <DialogDescription>
              {durationTimerTarget?.exerciseName ?? "Exercise"} · set {(durationTimerTarget?.setIndex ?? 0) + 1}. Manual entry stays editable after using a timer.
            </DialogDescription>
          </DialogHeader>
          {exerciseTimer && durationTimerTarget?.setLocalId === exerciseTimer.setLocalId ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 py-5 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{exerciseTimer.mode === "stopwatch" ? "Stopwatch" : "Timer"}</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums">{formatDurationInput(exerciseTimerValue)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {exerciseTimer.status === "running" ? <Button type="button" variant="outline" onClick={pauseExerciseTimer}>Pause</Button> : <Button type="button" variant="outline" onClick={resumeExerciseTimer}>{exerciseTimerValue === 0 && exerciseTimer.mode === "stopwatch" ? "Start" : "Resume"}</Button>}
                <Button type="button" onClick={commitExerciseTimerResult}>{exerciseTimer.mode === "stopwatch" ? "Use elapsed time" : "Use timer time"}</Button>
              </div>
              <Button type="button" variant="ghost" className="w-full" onClick={resetExerciseTimer}>Reset</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setExerciseTimer(null)}>Discard timer</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => startExerciseTimer("stopwatch", 0)}><TimerReset className="size-5" />Stopwatch</Button>
                <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => startExerciseTimer("countdown", countdownTargetSeconds)}><Timer className="size-5" />Start timer</Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exercise-timer-target">Timer length</Label>
                <DurationInput id="exercise-timer-target" className="text-base md:text-sm" durationSeconds={countdownTargetSeconds} aria-label="Countdown timer length in minutes and seconds" onDurationChange={(seconds) => setCountdownTargetSeconds(seconds)} />
                <div className="flex flex-wrap gap-1.5">
                  {[30, 60, 120, 300, 600, 900, 1800].map((seconds) => <Button key={seconds} type="button" size="sm" variant={countdownTargetSeconds === seconds ? "secondary" : "outline"} onClick={() => setCountdownTargetSeconds(seconds)}>{seconds < 60 ? "30 sec" : `${seconds / 60} min`}</Button>)}
                </div>
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Keyboard className="size-3.5" />Edit the TIME field directly for manual entry.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingExerciseTimerStart !== null}
        onOpenChange={(open) => {
          if (!open) setPendingExerciseTimerStart(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Another exercise timer is running</AlertDialogTitle>
            <AlertDialogDescription>Keep the current timer, or stop it and start this one. The current timer’s value will not be saved unless you use it first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current timer</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const next = pendingExerciseTimerStart; setExerciseTimer(null); setPendingExerciseTimerStart(null); if (next) beginExerciseTimer(next.mode, next.targetSeconds); }}>Stop current and start this one</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showActiveTimerFinishDialog} onOpenChange={setShowActiveTimerFinishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>An exercise timer is still running</AlertDialogTitle>
            <AlertDialogDescription>Stop the timer and use its current result before finishing, or keep the workout open.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep workout open</AlertDialogCancel>
            <AlertDialogAction onClick={() => { commitExerciseTimerResult(); setShowActiveTimerFinishDialog(false); requestFinishWorkout(); }}>Use time and finish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
