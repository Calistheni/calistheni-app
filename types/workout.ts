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
  secondaryMuscles: string[];
  thumbnailUrl: string | null;
  videoUrl: string | null;
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
  createdByUserId?: string | null;
};

export type WorkoutSetInput = {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  steps: number | null;
  floors: number | null;
  rpe: number | null;
  notes: string | null;
  completed: boolean;
  supersetRoundIndex: number | null;
};

export type SupersetColorKey = "BLUE" | "VIOLET" | "AMBER" | "GREEN";

export type WorkoutSupersetInput = {
  key: string;
  label: string | null;
  colorKey: SupersetColorKey;
  restSeconds: number | null;
  plannedRounds: number | null;
  hardRoundLimit: number | null;
};

export type WorkoutExerciseInput = {
  exerciseId: string;
  notes: string | null;
  restSeconds: number | null;
  supersetKey: string | null;
  supersetPosition: number | null;
  sets: WorkoutSetInput[];
};

export type WorkoutMutationPayload = {
  title: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  supersets: WorkoutSupersetInput[];
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
  supersets: Array<WorkoutSupersetInput & { id: string }>;
  exercises: Array<{
    id: number;
    notes: string | null;
    restSeconds: number | null;
    supersetKey: string | null;
    supersetPosition: number | null;
    exercise: ExerciseListItem;
    sets: Array<{
      id: number;
      reps: number | null;
      weight: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      steps: number | null;
      floors: number | null;
      rpe: number | null;
      notes: string | null;
      completed: boolean;
      supersetRoundIndex: number | null;
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
