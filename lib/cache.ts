import { openDB, type IDBPDatabase } from "idb";
import type { ParkDetail, ParkSummary } from "@/types/park";

let dbPromise: Promise<IDBPDatabase> | null = null;
const PARKS_CACHE_SCHEMA_VERSION = 2;
const PARK_DETAIL_CACHE_SCHEMA_VERSION = 2;

async function getDB() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }

  if (!dbPromise) {
    dbPromise = openDB("calisthenics-db", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("parks")) {
          db.createObjectStore("parks");
        }

        if (!db.objectStoreNames.contains("park-details")) {
          db.createObjectStore("park-details");
        }
      },
    });
  }

  return dbPromise;
}

export async function mergeParks(
  updated: ParkSummary[],
  deleted: number[],
  version?: string | null
): Promise<ParkSummary[] | null> {
  const cached = await loadParks();

  if (!cached) {
    return null;
  }

  const parksMap = new Map<number, ParkSummary>(
    cached.data.map((park: ParkSummary) => [park.id, park])
  );

  updated.forEach((park) => {
    parksMap.set(park.id, park);
  });

  deleted.forEach((id) => {
    parksMap.delete(id);
  });

  const merged: ParkSummary[] = [...parksMap.values()];

  await saveParks(merged, version ?? undefined);

  return merged;
}
export async function saveParks(parks: ParkSummary[], version?: string) {
  const db = await getDB();

  await db.put(
    "parks",
    {
      data: parks,
      version,
      schemaVersion: PARKS_CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    },
    "all"
  );
}
export async function loadParks() {
  if (typeof window === "undefined") {
    return null;
  }

  const db = await getDB();
  const cache = await db.get("parks", "all");

  if (!cache || cache.schemaVersion !== PARKS_CACHE_SCHEMA_VERSION) {
    return null;
  }

  return cache;
}

export async function saveParkDetail(park: ParkDetail) {
  const db = await getDB();
  await db.put(
    "park-details",
    {
      data: park,
      schemaVersion: PARK_DETAIL_CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    },
    park.id
  );
}

export async function loadParkDetail(id: number) {
  if (typeof window === "undefined") {
    return null;
  }

  const db = await getDB();
  const cache = await db.get("park-details", id);

  if (!cache || cache.schemaVersion !== PARK_DETAIL_CACHE_SCHEMA_VERSION) {
    return null;
  }

  return cache.data as ParkDetail;
}

export async function saveAdminParks(
  parks: ParkSummary[],
  lastUpdated?: string
) {
  const db = await getDB();

  await db.put(
    "parks",
    {
      data: parks,
      count: parks.length,
      lastUpdated,
      schemaVersion: PARKS_CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    },
    "admin"
  );
}

export async function loadAdminParks() {
  if (typeof window === "undefined") {
    return null;
  }

  const db = await getDB();

  const cache = await db.get("parks", "admin");

  if (!cache || cache.schemaVersion !== PARKS_CACHE_SCHEMA_VERSION) {
    return null;
  }

  return cache;
}
