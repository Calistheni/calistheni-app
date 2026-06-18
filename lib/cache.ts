import { openDB, type IDBPDatabase } from "idb";
import type { ParkDetail, ParkSummary } from "@/types/park";

let dbPromise: Promise<IDBPDatabase> | null = null;

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

export async function saveParks(parks: ParkSummary[]) {
  const db = await getDB();

  await db.put(
    "parks",
    {
      data: parks,
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
  return db.get("parks", "all");
}

export async function saveParkDetail(park: ParkDetail) {
  const db = await getDB();
  await db.put("park-details", park, park.id);
}

export async function loadParkDetail(id: number) {
  if (typeof window === "undefined") {
    return null;
  }

  const db = await getDB();
  return db.get("park-details", id);
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

  return db.get("parks", "admin");
}
