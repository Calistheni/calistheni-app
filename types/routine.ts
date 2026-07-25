import type {
  ExerciseListItem,
  SupersetColorKey,
  WorkoutSupersetInput,
} from "@/types/workout";

export type RoutineSetInput = {
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
};

export type RoutineExerciseInput = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  supersetKey: string | null;
  supersetPosition: number | null;
  sets: RoutineSetInput[];
};

export type RoutineMutationPayload = {
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  supersets: WorkoutSupersetInput[];
  exercises: RoutineExerciseInput[];
};

export type RoutineDetail = {
  id: number;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: string;
  updatedAt: string;
  supersets: Array<{
    id: string;
    key: string;
    label: string | null;
    colorKey: SupersetColorKey;
    restSeconds: number | null;
    plannedRounds: number | null;
  }>;
  exercises: Array<{
    id: number;
    restSeconds: number | null;
    notes: string | null;
    supersetKey: string | null;
    supersetPosition: number | null;
    exercise: ExerciseListItem;
    sets: Array<{
      id: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
    }>;
  }>;
};
