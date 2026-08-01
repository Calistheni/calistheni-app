"use client";

import { useActiveWorkout } from "./ActiveWorkoutProvider";

export function useActiveWorkoutSummary() {
  return useActiveWorkout();
}
