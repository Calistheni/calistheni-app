"use client";

import type { QueryClient } from "@tanstack/react-query";
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
  NativeRewards,
} from "./types";
import type { NativePrimaryHref } from "./navigation";

export type NativePrimaryQueryName =
  | "home"
  | "nutrition"
  | "parks"
  | "community"
  | "rewards";

export type NativePrimaryDataMap = {
  home: NativeHome;
  nutrition: NativeNutrition;
  parks: NativeParks;
  community: NativeCommunity;
  rewards: NativeRewards;
};

export const nativePrimaryQueryNames: NativePrimaryQueryName[] = [
  "home",
  "nutrition",
  "parks",
  "community",
  "rewards",
];

const hrefQuery: Record<NativePrimaryHref, NativePrimaryQueryName> = {
  "/home": "home",
  "/nutrition": "nutrition",
  "/parks": "parks",
  "/feed": "community",
  "/rewards": "rewards",
};

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
  return ["native", "primary", userId, primarySnapshotKey(name, nutritionDate)] as const;
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
  const value = await apiFetch<NativePrimaryDataMap[Name]>(
    primaryEndpoint(name, nutritionDate),
    { signal }
  );
  await writePrimarySnapshot(
    userId,
    primarySnapshotKey(name, nutritionDate),
    value
  );
  return value;
}

export async function hydratePrimarySnapshots(
  queryClient: QueryClient,
  userId: string,
  nutritionDate = currentNutritionDate()
) {
  await Promise.all(
    nativePrimaryQueryNames.map(async (name) => {
      const snapshotKey = primarySnapshotKey(name, nutritionDate);
      let value = await readPrimarySnapshot<NativePrimaryDataMap[typeof name]>(
        userId,
        snapshotKey
      );
      // Preserve the Rewards cache written by the first bundled-native release.
      if (!value && name === "rewards") {
        value = await readUserCache<NativeRewards>(userId, "rewards");
        if (value) await writePrimarySnapshot(userId, snapshotKey, value);
      }
      if (value !== undefined) {
        // Persisted data is presentation-ready but deliberately stale. This
        // gives the first frame real values and still starts a background refresh.
        queryClient.setQueryData(
          primaryQueryKey(userId, name, nutritionDate),
          value,
          { updatedAt: 0 }
        );
      }
    })
  );
}

export async function warmPrimaryQueries(
  queryClient: QueryClient,
  userId: string,
  activeHref: NativePrimaryHref,
  nutritionDate = currentNutritionDate()
) {
  const activeName = hrefQuery[activeHref];
  const backgroundNames = nativePrimaryQueryNames.filter(
    (name) => name !== activeName
  );
  // The visible surface owns its high-priority request. Warm the remaining
  // compact DTOs sequentially during idle time to avoid a startup request burst.
  for (const name of backgroundNames) {
    await queryClient.prefetchQuery({
      queryKey: primaryQueryKey(userId, name, nutritionDate),
      queryFn: ({ signal }) => fetchPrimarySnapshot(userId, name, nutritionDate, signal),
      staleTime: 60_000,
    });
  }
}
