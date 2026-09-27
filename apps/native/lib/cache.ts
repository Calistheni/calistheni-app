"use client";

import { openDB } from "idb";

const DATABASE = "calistheni-native-presentation-v1";
const STORE = "user-data";
export const PRIMARY_SNAPSHOT_VERSION = 1;

export type PersistedPrimarySnapshot<T> = {
  version: typeof PRIMARY_SNAPSHOT_VERSION;
  userId: string;
  key: string;
  savedAt: string;
  data: T;
};

export function createPrimarySnapshotRecord<T>(userId: string, key: string, data: T) {
  if (data === undefined || data === null) {
    throw new Error("A primary snapshot must contain validated data.");
  }
  return {
    version: PRIMARY_SNAPSHOT_VERSION,
    userId,
    key,
    savedAt: new Date().toISOString(),
    data,
  } satisfies PersistedPrimarySnapshot<T>;
}

export function decodePrimarySnapshotRecord<T>(value: unknown, userId: string, key: string) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<PersistedPrimarySnapshot<T>>;
  if (record.version !== PRIMARY_SNAPSHOT_VERSION || record.userId !== userId || record.key !== key || record.data === undefined || record.data === null) {
    return undefined;
  }
  return record.data;
}

async function database() {
  return openDB(DATABASE, 1, {
    upgrade(db) { db.createObjectStore(STORE); },
  });
}

export async function readUserCache<T>(userId: string, key: string) {
  return (await (await database()).get(STORE, `${userId}:${key}`)) as T | undefined;
}

export async function writeUserCache<T>(userId: string, key: string, value: T) {
  await (await database()).put(STORE, value, `${userId}:${key}`);
}

export async function clearUserCache(userId: string) {
  const db = await database();
  const keys = await db.getAllKeys(STORE);
  await Promise.all(
    keys
      .filter((key) => typeof key === "string" && key.startsWith(`${userId}:`))
      .map((key) => db.delete(STORE, key))
  );
}

export async function readPrimarySnapshot<T>(userId: string, key: string) {
  const value = await readUserCache<PersistedPrimarySnapshot<T>>(
    userId,
    `primary:v${PRIMARY_SNAPSHOT_VERSION}:${key}`
  );
  return decodePrimarySnapshotRecord<T>(value, userId, key);
}

export async function writePrimarySnapshot<T>(
  userId: string,
  key: string,
  data: T
) {
  const value = createPrimarySnapshotRecord(userId, key, data);
  await writeUserCache(
    userId,
    `primary:v${PRIMARY_SNAPSHOT_VERSION}:${key}`,
    value
  );
}
