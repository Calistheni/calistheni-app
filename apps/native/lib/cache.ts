"use client";

import { openDB } from "idb";

const DATABASE = "calistheni-native-presentation-v1";
const STORE = "user-data";

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
