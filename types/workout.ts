export type ExerciseListItem = {
  id: string;
  slug: string;
  name: string;
  muscle: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

export type WorkoutSetInput = {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  notes: string | null;
};

export type WorkoutExerciseInput = {
  exerciseId: string;
  notes: string | null;
  sets: WorkoutSetInput[];
};

export type WorkoutMutationPayload = {
  title: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  exercises: WorkoutExerciseInput[];
};

export type WorkoutDetail = {
  id: number;
  title: string | null;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: Array<{
    id: number;
    notes: string | null;
    exercise: ExerciseListItem;
    sets: Array<{
      id: number;
      reps: number | null;
      weight: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      notes: string | null;
    }>;
  }>;
};

export type WorkoutSummary = {
  id: number;
  title: string | null;
  startedAt: string;
  completedAt: string | null;
  exerciseCount: number;
  setCount: number;
};
