import type {
  ExerciseListItem,
  SupersetColorKey,
} from "@/types/workout";

export type RoutineSetInput = {
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceMeters: number | null;
  steps: number | null;
  floors: number | null;
};

export type RoutineExerciseInput = {
  clientExerciseId: string;
  routineExerciseId: number | null;
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  sets: RoutineSetInput[];
};

export type RoutineSupersetInput = {
  key: string;
  label: string | null;
  colorKey: SupersetColorKey;
  restSeconds: number | null;
  plannedRounds: number | null;
  hardRoundLimit: number | null;
  exerciseClientIds: string[];
};

export type RoutineMutationPayload = {
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  supersets: RoutineSupersetInput[];
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
    hardRoundLimit: number | null;
    exerciseClientIds: string[];
  }>;
  exercises: Array<{
    id: number;
    clientExerciseId: string;
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
      distanceMeters: number | null;
      steps: number | null;
      floors: number | null;
    }>;
  }>;
};
