export type ExerciseTrackingType =
  | "NOT_SELECTED"
  | "BODYWEIGHT_REPS"
  | "WEIGHTED_BODYWEIGHT"
  | "EXTERNAL_WEIGHT"
  | "DURATION"
  | "DISTANCE_DURATION"
  | "STEPS_DISTANCE_DURATION"
  | "FLOORS_DISTANCE_DURATION"
  | "WEIGHT_DISTANCE_DURATION";

export type ExerciseListItem = {
  id: string;
  slug: string;
  name: string;
  muscle: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
};

export type WorkoutSetInput = {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  steps: number | null;
  floors: number | null;
  notes: string | null;
  completed: boolean;
};

export type WorkoutExerciseInput = {
  exerciseId: string;
  notes: string | null;
  restSeconds: number | null;
  sets: WorkoutSetInput[];
};

export type WorkoutMutationPayload = {
  title: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  visibility: "PRIVATE" | "PUBLIC";
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
    restSeconds: number | null;
    exercise: ExerciseListItem;
    sets: Array<{
      id: number;
      reps: number | null;
      weight: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      steps: number | null;
      floors: number | null;
      notes: string | null;
      completed: boolean;
    }>;
  }>;
  visibility: "PRIVATE" | "PUBLIC";
  setCount: number;
  totalVolume: number | null;
};

export type WorkoutSummary = {
  id: number;
  title: string | null;
  startedAt: string;
  completedAt: string | null;
  exerciseCount: number;
  setCount: number;
  totalVolume: number | null;
  visibility: "PRIVATE" | "PUBLIC";
  user?: {
    id: string;
    name: string | null;
    image: string | null;
  };
};
