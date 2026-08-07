/** Stable display identity. Local Food records and provider previews are distinct
 * domains; provider numeric IDs alone are not globally unique. */
export type FoodResultIdentity = { id?: string; provider?: string; source?: string; externalId: string };
export function foodResultKey(food: FoodResultIdentity) {
  return food.id ? `local:${food.id}` : `${food.provider ?? food.source ?? "unknown"}:${food.externalId}`;
}
/** Keeps the first ranked copy of an identical result without merging sources. */
export function deduplicateFoodResults<T extends FoodResultIdentity>(foods: T[]) {
  const seen = new Set<string>();
  return foods.filter((food) => { const identity = foodResultKey(food); if (seen.has(identity)) return false; seen.add(identity); return true; });
}
