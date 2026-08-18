"use client";

/**
 * Small session-local cache for the complete Saved Foods collection. The
 * picker is lazy-loaded, while history menus can change bookmarks first, so
 * all client entry points must share invalidation rather than retain copies.
 */
export type SavedFoodCacheItem = { id?: string; isSaved?: boolean };

let savedFoodsCache: SavedFoodCacheItem[] | null = null;
let savedFoodsRequest: Promise<SavedFoodCacheItem[]> | null = null;
let savedFoodsVersion = 0;

export function getSavedFoodsCache<T extends SavedFoodCacheItem>() {
  return savedFoodsCache as T[] | null;
}

export async function loadSavedFoodsCache<
  T extends SavedFoodCacheItem
>(): Promise<T[]> {
  if (savedFoodsCache) return savedFoodsCache as T[];
  if (!savedFoodsRequest) {
    const requestVersion = savedFoodsVersion;
    const request: Promise<SavedFoodCacheItem[]> = fetch(
      "/api/nutrition/saved-foods",
      { cache: "no-store" }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load saved foods.");
        const data = await response.json();
        return (data.foods ?? []) as SavedFoodCacheItem[];
      })
      .then((foods) => {
        // A history/menu mutation may invalidate this request while it is in
        // flight. Never let its stale result repopulate the picker cache.
        if (requestVersion === savedFoodsVersion) savedFoodsCache = foods;
        return foods;
      })
      .finally(() => {
        if (savedFoodsRequest === request) savedFoodsRequest = null;
      });
    savedFoodsRequest = request;
  }
  const requestVersion = savedFoodsVersion;
  const foods = await savedFoodsRequest;
  return requestVersion === savedFoodsVersion
    ? (foods as T[])
    : loadSavedFoodsCache<T>();
}

export function updateSavedFoodsCache<T extends SavedFoodCacheItem>(
  food: T,
  saved: boolean
) {
  if (!savedFoodsCache || !food.id) return;
  savedFoodsCache = saved
    ? [
        { ...food, isSaved: true },
        ...savedFoodsCache.filter((item) => item.id !== food.id),
      ]
    : savedFoodsCache.filter((item) => item.id !== food.id);
}

export function invalidateSavedFoodsCache() {
  savedFoodsVersion += 1;
  savedFoodsCache = null;
  savedFoodsRequest = null;
}
