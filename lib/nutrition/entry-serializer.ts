import { toFoodSummary } from "./service";

/** Visual food metadata is intentionally canonical-only; nutrition remains immutable on the entry snapshot. */
export function serializeNutritionEntry(entry: { food: Record<string, unknown>; [key: string]: unknown }) {
  const { food, ...snapshot } = entry;
  return { ...snapshot, foodVisual: toFoodSummary(food) };
}
