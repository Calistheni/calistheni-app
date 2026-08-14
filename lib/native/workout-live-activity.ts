"use client";

import { registerPlugin } from "@capacitor/core";
import { isIOSApp, isNativePluginAvailable } from "@/lib/native/platform";

export type WorkoutLiveActivityState = {
  workoutId: string;
  workoutStartedAtMs: number;
  exerciseName: string;
  setLabel: string;
  displayPerformance: string;
  completedSets: number;
  totalSets: number;
  isResting: boolean;
  restEndsAtMs: number | null;
};

type WorkoutLiveActivityPlugin = {
  isSupported(): Promise<{ supported: boolean; enabled: boolean }>;
  start(options: WorkoutLiveActivityState): Promise<{ started: boolean }>;
  update(options: WorkoutLiveActivityState): Promise<void>;
  end(options: { workoutId: string; completedSets: number; totalSets: number }): Promise<void>;
};

const WorkoutLiveActivity = registerPlugin<WorkoutLiveActivityPlugin>("WorkoutLiveActivity");
let lastStateKey: string | null = null;

function supported() {
  return isIOSApp() && isNativePluginAvailable("WorkoutLiveActivity");
}

export async function syncWorkoutLiveActivity(state: WorkoutLiveActivityState) {
  if (!supported()) return false;
  const key = JSON.stringify(state);
  if (key === lastStateKey) return true;
  try {
    const capability = await WorkoutLiveActivity.isSupported();
    if (!capability.supported || !capability.enabled) return false;
    if (lastStateKey === null) await WorkoutLiveActivity.start(state);
    else await WorkoutLiveActivity.update(state);
    lastStateKey = key;
    return true;
  } catch {
    return false;
  }
}

export async function endWorkoutLiveActivity(workoutId: string, completedSets: number, totalSets: number) {
  if (!supported()) return;
  try {
    await WorkoutLiveActivity.end({ workoutId, completedSets, totalSets });
  } finally {
    lastStateKey = null;
  }
}
