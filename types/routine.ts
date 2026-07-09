import type { ExerciseListItem } from "@/types/workout";

export type RoutineSetInput = {
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
};

export type RoutineExerciseInput = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  sets: RoutineSetInput[];
};

export type RoutineMutationPayload = {
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  exercises: RoutineExerciseInput[];
};

export type RoutineDetail = {
  id: number;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: string;
  updatedAt: string;
  exercises: Array<{
    id: number;
    restSeconds: number | null;
    notes: string | null;
    exercise: ExerciseListItem;
    sets: Array<{
      id: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
    }>;
  }>;
};
