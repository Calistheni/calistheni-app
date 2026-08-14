"use client";

import { registerPlugin } from "@capacitor/core";
import { isIOSApp, isNativePluginAvailable } from "@/lib/native/platform";
import type { BodyFatSex } from "@/lib/anthropometry";

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
  requestAuthorization(options: { includePro: boolean }): Promise<{ requestStatus: AppleHealthAuthorizationStatus }>;
  getAuthorizationStatus(options: { includePro: boolean }): Promise<{ requestStatus: AppleHealthAuthorizationStatus }>;
  getLatestBodyWeight(): Promise<{ weightKg: number | null; sampledAtMs: number | null }>;
  getLatestProfileMeasurements(options: { includePro: boolean }): Promise<AppleHealthProfileMeasurements>;
  saveWorkout(options: AppleHealthWorkoutPayload): Promise<{ saved: boolean; duplicate: boolean }>;
};

export type AppleHealthProfileMeasurements = {
  bodyweightKg: number | null;
  waistAtNavelCm: number | null;
  heightCm: number | null;
  manualBodyFatPercent: number | null;
  dateOfBirth: string | null;
  bodyFatSex: BodyFatSex | null;
  sampledAtMs: Partial<Record<"bodyweightKg" | "waistAtNavelCm" | "heightCm" | "manualBodyFatPercent", number>>;
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

export async function requestAppleHealthAuthorization(includePro = false) {
  if (!supported()) return "unavailable" as const;
  try {
    return (await AppleHealth.requestAuthorization({ includePro })).requestStatus;
  } catch {
    return "unknown" as const;
  }
}

export async function getAppleHealthAuthorizationStatus(includePro = false) {
  if (!supported()) return "unavailable" as const;
  try {
    return (await AppleHealth.getAuthorizationStatus({ includePro })).requestStatus;
  } catch {
    return "unknown" as const;
  }
}

export async function getLatestAppleHealthProfileMeasurements(includePro: boolean): Promise<AppleHealthProfileMeasurements> {
  const empty: AppleHealthProfileMeasurements = { bodyweightKg: null, waistAtNavelCm: null, heightCm: null, manualBodyFatPercent: null, dateOfBirth: null, bodyFatSex: null, sampledAtMs: {} };
  if (!supported()) return empty;
  try {
    return await AppleHealth.getLatestProfileMeasurements({ includePro });
  } catch {
    return empty;
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
