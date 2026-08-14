/** Nutrition amount fields keep a text buffer while typing; parsing happens only when valid. */
export function normalizeNutritionAmountInput(value: string) {
  return value.trim().replace(",", ".");
}

export function isValidNutritionAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100_000
  );
}

export function parseNutritionAmount(value: string): number | null {
  const normalized = normalizeNutritionAmountInput(value);
  if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  return isValidNutritionAmount(amount) ? amount : null;
}

export function formatNutritionAmount(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(3))) : "";
}
