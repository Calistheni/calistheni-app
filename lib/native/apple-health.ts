"use client";

import { registerPlugin } from "@capacitor/core";
import { isIOSApp, isNativePluginAvailable } from "@/lib/native/platform";

export type AppleHealthAuthorizationStatus =
  | "unavailable"
  | "shouldRequest"
  | "unnecessary"
  | "unknown";

export type AppleHealthWorkoutPayload = {
  workoutId: string;
  startedAtMs: number;
  endedAtMs: number;
  distanceMeters: number | null;
};

type AppleHealthPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ requestStatus: AppleHealthAuthorizationStatus }>;
  getAuthorizationStatus(): Promise<{ requestStatus: AppleHealthAuthorizationStatus }>;
  getLatestBodyWeight(): Promise<{ weightKg: number | null; sampledAtMs: number | null }>;
  saveWorkout(options: AppleHealthWorkoutPayload): Promise<{ saved: boolean; duplicate: boolean }>;
};

const AppleHealth = registerPlugin<AppleHealthPlugin>("CalistheniHealth");

function supported() {
  return isIOSApp() && isNativePluginAvailable("CalistheniHealth");
}

export async function isAppleHealthAvailable() {
  if (!supported()) return false;
  try {
    return (await AppleHealth.isAvailable()).available;
  } catch {
    return false;
  }
}

export async function requestAppleHealthAuthorization() {
  if (!supported()) return "unavailable" as const;
  try {
    return (await AppleHealth.requestAuthorization()).requestStatus;
  } catch {
    return "unknown" as const;
  }
}

export async function getAppleHealthAuthorizationStatus() {
  if (!supported()) return "unavailable" as const;
  try {
    return (await AppleHealth.getAuthorizationStatus()).requestStatus;
  } catch {
    return "unknown" as const;
  }
}

export async function getLatestAppleHealthBodyWeight() {
  if (!supported()) return { weightKg: null, sampledAtMs: null };
  try {
    return await AppleHealth.getLatestBodyWeight();
  } catch {
    return { weightKg: null, sampledAtMs: null };
  }
}

export async function saveAppleHealthWorkout(payload: AppleHealthWorkoutPayload) {
  if (!supported()) return { saved: false, duplicate: false };
  try {
    return await AppleHealth.saveWorkout(payload);
  } catch {
    // HealthKit is optional. Callers must never make a saved workout depend on it.
    return { saved: false, duplicate: false };
  }
}
