"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import {
  readPrimarySnapshot,
  readUserCache,
  writePrimarySnapshot,
} from "./cache";
import type {
  NativeCommunity,
  NativeHome,
  NativeNutrition,
  NativeParks,
  NativeProfile,
  NativeRewards,
} from "./types";

export type NativePrimaryQueryName =
  | "home"
  | "nutrition"
  | "parks"
  | "community"
  | "rewards"
  | "profile";

export type NativePrimaryDataMap = {
  home: NativeHome;
  nutrition: NativeNutrition;
  parks: NativeParks;
  community: NativeCommunity;
  rewards: NativeRewards;
  profile: NativeProfile;
};

export type NativePrimaryFetcher = <Name extends NativePrimaryQueryName>(
  userId: string,
  name: Name,
  nutritionDate?: string,
  signal?: AbortSignal
) => Promise<NativePrimaryDataMap[Name]>;

export const nativePrimaryQueryNames: NativePrimaryQueryName[] = [
  "home",
  "nutrition",
  "parks",
  "community",
  "rewards",
  "profile",
];

const lastKnownGood = new Map<string, NativePrimaryDataMap[NativePrimaryQueryName]>();

export const primaryKeys = {
  root: ["native", "primary"] as const,
  user: (userId: string) => ["native", "primary", userId] as const,
  snapshot: (userId: string, snapshotKey: string) =>
    ["native", "primary", userId, snapshotKey] as const,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteFields(value: unknown, keys: string[]) {
  return isRecord(value) && keys.every((key) => finite(value[key]));
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function validNutritionNumbers(value: unknown) {
  return isRecord(value) && Object.values(value).every(
    (entry) => entry === null || entry === undefined || finite(entry)
  );
}

function validCommunityItem(value: unknown) {
  return isRecord(value)
    && finite(value.id)
    && typeof value.title === "string"
    && nullableString(value.completedAt)
    && finiteFields(value, ["exerciseCount", "setCount"])
    && (value.totalVolume === null || finite(value.totalVolume))
    && isRecord(value.athlete)
    && typeof value.athlete.id === "string"
    && nullableString(value.athlete.name)
    && nullableString(value.athlete.image);
}

function validReward(value: unknown) {
  return isRecord(value)
    && finiteFields(value, ["id", "pointsCost"])
    && typeof value.title === "string"
    && typeof value.partnerName === "string"
    && typeof value.description === "string"
    && nullableString(value.imageUrl);
}

function validRedemption(value: unknown) {
  return isRecord(value)
    && finiteFields(value, ["id", "rewardId"])
    && typeof value.status === "string"
    && typeof value.createdAt === "string";
}

export function validatePrimaryData<Name extends NativePrimaryQueryName>(
  name: Name,
  value: unknown
): NativePrimaryDataMap[Name] {
  if (!isRecord(value)) throw new Error(`Invalid ${name} snapshot.`);
  const valid = name === "home"
    ? isRecord(value.week) && typeof value.greetingName === "string" && typeof value.asOf === "string" && finite(value.streakDays) && typeof value.week.startsAt === "string" && finiteFields(value.week, ["workouts", "completedSets", "activeDays", "totalReps", "durationSeconds", "personalRecords", "workoutGoal"]) && (value.week.totalVolumeKg === null || finite(value.week.totalVolumeKg)) && (value.recentWorkout === null || (isRecord(value.recentWorkout) && finite(value.recentWorkout.id) && typeof value.recentWorkout.title === "string" && nullableString(value.recentWorkout.completedAt)))
    : name === "nutrition"
      ? typeof value.date === "string" && validNutritionNumbers(value.totals) && (value.goal === null || isRecord(value.goal)) && finite(value.entryCount) && typeof value.updatedAt === "string"
      : name === "parks"
        ? finite(value.publicParkCount) && (value.version === null || typeof value.version === "string") && typeof value.updatedAt === "string"
        : name === "community"
          ? Array.isArray(value.items) && value.items.every(validCommunityItem) && typeof value.updatedAt === "string"
          : name === "rewards"
            ? finite(value.balance) && Array.isArray(value.rewards) && value.rewards.every(validReward) && Array.isArray(value.redemptions) && value.redemptions.every(validRedemption) && isRecord(value.entitlement) && typeof value.entitlement.isPro === "boolean" && typeof value.entitlement.canEarnRewardPoints === "boolean" && typeof value.updatedAt === "string"
            : isRecord(value.user) && isRecord(value.stats) && isRecord(value.body) && isRecord(value.entitlement) && typeof value.user.id === "string" && nullableString(value.user.name) && nullableString(value.user.username) && nullableString(value.user.image) && finiteFields(value.stats, ["workouts", "completedSets", "submittedParks", "approvedEdits", "approvedPhotos", "rewardPoints", "followers", "following"]) && (value.body.bodyweightKg === null || finite(value.body.bodyweightKg)) && (value.body.measurementSystem === "METRIC" || value.body.measurementSystem === "IMPERIAL") && typeof value.entitlement.isPro === "boolean" && typeof value.updatedAt === "string";
  if (!valid) throw new Error(`Invalid ${name} snapshot.`);
  return value as NativePrimaryDataMap[Name];
}

export function currentNutritionDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function primarySnapshotKey(
  name: NativePrimaryQueryName,
  nutritionDate = currentNutritionDate()
) {
  return name === "nutrition" ? `nutrition:${nutritionDate}` : name;
}

export function primaryQueryKey(
  userId: string,
  name: NativePrimaryQueryName,
  nutritionDate = currentNutritionDate()
) {
  return primaryKeys.snapshot(userId, primarySnapshotKey(name, nutritionDate));
}

function memoryKey(userId: string, name: NativePrimaryQueryName, nutritionDate: string) {
  return JSON.stringify(primaryQueryKey(userId, name, nutritionDate));
}

export function rememberPrimarySnapshot<Name extends NativePrimaryQueryName>(
  userId: string,
  name: Name,
  value: NativePrimaryDataMap[Name],
  nutritionDate = currentNutritionDate()
) {
  lastKnownGood.set(memoryKey(userId, name, nutritionDate), value);
}

export function getLastKnownPrimarySnapshot<Name extends NativePrimaryQueryName>(
  userId: string,
  name: Name,
  nutritionDate = currentNutritionDate()
) {
  return lastKnownGood.get(memoryKey(userId, name, nutritionDate)) as NativePrimaryDataMap[Name] | undefined;
}

export function forgetPrimarySnapshots(userId: string) {
  for (const key of lastKnownGood.keys()) {
    const parsed = JSON.parse(key) as unknown[];
    if (parsed[2] === userId) lastKnownGood.delete(key);
  }
}

export function seedHydratedPrimarySnapshot<Name extends NativePrimaryQueryName>(
  queryClient: QueryClient,
  userId: string,
  name: Name,
  value: NativePrimaryDataMap[Name],
  nutritionDate = currentNutritionDate()
) {
  rememberPrimarySnapshot(userId, name, value, nutritionDate);
  const queryKey = primaryQueryKey(userId, name, nutritionDate);
  if (queryClient.getQueryData(queryKey) === undefined) {
    queryClient.setQueryData(queryKey, value, { updatedAt: 0 });
  }
}

function primaryEndpoint(name: NativePrimaryQueryName, nutritionDate: string) {
  if (name === "nutrition") {
    return `/api/native/v1/nutrition?date=${encodeURIComponent(nutritionDate)}`;
  }
  return `/api/native/v1/${name}`;
}

export async function fetchPrimarySnapshot<Name extends NativePrimaryQueryName>(
  userId: string,
  name: Name,
  nutritionDate = currentNutritionDate(),
  signal?: AbortSignal
): Promise<NativePrimaryDataMap[Name]> {
  const response = await apiFetch<unknown>(
    primaryEndpoint(name, nutritionDate),
    { signal }
  );
  const value = validatePrimaryData(name, response);
  if (name === "profile" && (value as NativeProfile).user.id !== userId) {
    throw new Error("Profile snapshot does not belong to the authenticated user.");
  }
  await writePrimarySnapshot(
    userId,
    primarySnapshotKey(name, nutritionDate),
    value
  );
  rememberPrimarySnapshot(userId, name, value, nutritionDate);
  return value;
}

export function usePrimarySnapshot<Name extends NativePrimaryQueryName>(
  userId: string,
  name: Name,
  active: boolean,
  nutritionDate = currentNutritionDate()
) {
  return useQuery<NativePrimaryDataMap[Name]>({
    queryKey: primaryQueryKey(userId, name, nutritionDate),
    enabled: active && Boolean(userId),
    staleTime: name === "parks" ? 5 * 60_000 : 60_000,
    initialData: () => getLastKnownPrimarySnapshot(userId, name, nutritionDate),
    queryFn: ({ signal }) => fetchPrimarySnapshot(userId, name, nutritionDate, signal),
  });
}

export async function hydratePrimarySnapshots(
  queryClient: QueryClient,
  userId: string,
  nutritionDate = currentNutritionDate()
) {
  const hydrated: NativePrimaryQueryName[] = [];
  await Promise.all(
    nativePrimaryQueryNames.map(async (name) => {
      const snapshotKey = primarySnapshotKey(name, nutritionDate);
      let value = await readPrimarySnapshot<NativePrimaryDataMap[typeof name]>(
        userId,
        snapshotKey
      );
      // Preserve the Rewards cache written by the first bundled-native release.
      if (!value && name === "rewards") {
        const legacy = await readUserCache<NativeRewards>(userId, "rewards");
        if (legacy) {
          try {
            value = validatePrimaryData("rewards", legacy);
            await writePrimarySnapshot(userId, snapshotKey, value);
          } catch {
            value = undefined;
          }
        }
      }
      if (value !== undefined) {
        try {
          value = validatePrimaryData(name, value);
        } catch {
          return;
        }
        // Hydration may fill an empty query but must never replace a newer
        // in-memory last-known-good value with an older persisted record.
        seedHydratedPrimarySnapshot(queryClient, userId, name, value, nutritionDate);
        hydrated.push(name);
      }
    })
  );
  return hydrated;
}

export function missingPrimaryQueries(
  queryClient: QueryClient,
  userId: string,
  nutritionDate = currentNutritionDate()
) {
  return nativePrimaryQueryNames.filter(
    (name) => queryClient.getQueryData(primaryQueryKey(userId, name, nutritionDate)) === undefined
  );
}

export function assertPrimaryQueriesReady(
  queryClient: QueryClient,
  userId: string,
  nutritionDate = currentNutritionDate()
) {
  const missing = missingPrimaryQueries(queryClient, userId, nutritionDate);
  if (missing.length) {
    throw new Error(`PRIMARY_READY invariant failed: missing ${missing.join(", ")}.`);
  }
}

export function requirePrimarySnapshot<Name extends NativePrimaryQueryName>(
  name: Name,
  value: NativePrimaryDataMap[Name] | undefined
) {
  if (value === undefined) {
    throw new Error(`PRIMARY_READY invariant failed inside ${name} surface.`);
  }
  return value;
}

export async function ensurePrimaryQueriesReady(
  queryClient: QueryClient,
  userId: string,
  nutritionDate = currentNutritionDate(),
  fetcher: NativePrimaryFetcher = fetchPrimarySnapshot
) {
  const missing = missingPrimaryQueries(queryClient, userId, nutritionDate);
  await Promise.all(
    missing.map((name) =>
      queryClient.fetchQuery({
        queryKey: primaryQueryKey(userId, name, nutritionDate),
        queryFn: async ({ signal }) => validatePrimaryData(
          name,
          await fetcher(userId, name, nutritionDate, signal)
        ),
        staleTime: 60_000,
      })
    )
  );
  assertPrimaryQueriesReady(queryClient, userId, nutritionDate);
}

export async function revalidatePrimaryQueries(
  queryClient: QueryClient,
  userId: string,
  nutritionDate = currentNutritionDate(),
  fetcher: NativePrimaryFetcher = fetchPrimarySnapshot
) {
  await Promise.allSettled(
    nativePrimaryQueryNames.map((name) => queryClient.fetchQuery({
      queryKey: primaryQueryKey(userId, name, nutritionDate),
      queryFn: async ({ signal }) => validatePrimaryData(
        name,
        await fetcher(userId, name, nutritionDate, signal)
      ),
      staleTime: 0,
    }))
  );
}
