"use client";

import { localNutritionDateKey } from "@/lib/nutrition/date-navigation";

const VERSION = 1;
const PREFIX = `calistheni:nutrition-day:v${VERSION}`;

export type CachedNutritionEntry = {
  id: string;
  foodId: string;
  mealCategory: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACKS";
  foodNameSnapshot: string;
  brandNameSnapshot?: string | null;
  gramsConsumed: string | number;
  quantity: string | number;
  unit: string;
  caloriesKcalSnapshot?: string | number | null;
  proteinGramsSnapshot?: string | number | null;
  carbohydrateGramsSnapshot?: string | number | null;
  fatGramsSnapshot?: string | number | null;
  fiberGramsSnapshot?: string | number | null;
  sugarGramsSnapshot?: string | number | null;
  saturatedFatGramsSnapshot?: string | number | null;
  sodiumMgSnapshot?: string | number | null;
  foodVisual?: {
    imageUrl?: string | null;
    genericIcon?: { key?: string; url: string } | null;
  };
};

export type CachedNutritionDay = {
  entries: CachedNutritionEntry[];
  goal: Record<string, unknown> | null;
};

type StoredNutritionDay = {
  version: typeof VERSION;
  userId: string;
  date: string;
  savedAt: string;
  data: CachedNutritionDay;
};

const memory = new Map<string, CachedNutritionDay>();
const inflight = new Map<string, Promise<CachedNutritionDay>>();

function key(userId: string, date: string) {
  return `${PREFIX}:${encodeURIComponent(userId)}:${date}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is CachedNutritionEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.foodId === "string" &&
    typeof value.foodNameSnapshot === "string" &&
    typeof value.unit === "string" &&
    (typeof value.gramsConsumed === "string" ||
      typeof value.gramsConsumed === "number") &&
    (typeof value.quantity === "string" || typeof value.quantity === "number") &&
    ["BREAKFAST", "LUNCH", "DINNER", "SNACKS"].includes(
      String(value.mealCategory)
    )
  );
}

export function decodeNutritionDay(value: unknown): CachedNutritionDay | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null;
  if (!value.entries.every(isEntry)) return null;
  const rawGoal = value.goal ?? value.targets ?? null;
  if (rawGoal !== null && !isRecord(rawGoal)) return null;
  return {
    entries: value.entries,
    goal: rawGoal,
  };
}

export function readNutritionDay(
  userId: string,
  date: string
): CachedNutritionDay | null {
  const storageKey = key(userId, date);
  const cached = memory.get(storageKey);
  if (cached) return cached;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const record = JSON.parse(raw) as unknown;
    if (
      !isRecord(record) ||
      record.version !== VERSION ||
      record.userId !== userId ||
      record.date !== date
    ) {
      return null;
    }
    const data = decodeNutritionDay(record.data);
    if (data) memory.set(storageKey, data);
    return data;
  } catch {
    return null;
  }
}

function persistNutritionDay(
  userId: string,
  date: string,
  data: CachedNutritionDay
) {
  const storageKey = key(userId, date);
  memory.set(storageKey, data);
  if (typeof window === "undefined") return;
  const record: StoredNutritionDay = {
    version: VERSION,
    userId,
    date,
    savedAt: new Date().toISOString(),
    data,
  };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Persistence is an optimization; valid in-memory data remains usable.
  }
}

export function refreshNutritionDay(userId: string, date: string) {
  const storageKey = key(userId, date);
  const existing = inflight.get(storageKey);
  if (existing) return existing;

  const request = fetch(
    `/api/user/nutrition?date=${encodeURIComponent(date)}`,
    { cache: "no-store", credentials: "same-origin" }
  )
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load nutrition.");
      const data = decodeNutritionDay(await response.json());
      if (!data) throw new Error("Nutrition returned an invalid response.");
      persistNutritionDay(userId, date, data);
      return data;
    })
    .finally(() => inflight.delete(storageKey));

  inflight.set(storageKey, request);
  return request;
}

export function warmCurrentNutritionDay(userId: string) {
  return refreshNutritionDay(userId, localNutritionDateKey()).catch(() => {
    // Warmup is best-effort and never replaces the last successful snapshot.
  });
}
