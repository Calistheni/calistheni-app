const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// This is intentionally explicit: date text is rendered during SSR and must
// match the first browser render regardless of the device's preferred locale.
export const NUTRITION_DATE_LOCALE = "en-GB";

export function localNutritionDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function nutritionDateFromKey(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error("Expected a YYYY-MM-DD nutrition date key.");
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  // Midday keeps local calendar arithmetic stable through DST transitions.
  return new Date(year, month - 1, day, 12);
}

export function nutritionDateKeyFromLocalDate(date: Date) {
  return localNutritionDateKey(date);
}

export function addNutritionDays(dateKey: string, amount: number) {
  const date = nutritionDateFromKey(dateKey);
  date.setDate(date.getDate() + amount);
  return nutritionDateKeyFromLocalDate(date);
}

export function startOfNutritionWeek(dateKey: string) {
  const date = nutritionDateFromKey(dateKey);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return nutritionDateKeyFromLocalDate(date);
}

export function nutritionWeekDateKeys(dateKey: string) {
  const start = startOfNutritionWeek(dateKey);
  return Array.from({ length: 7 }, (_, index) => addNutritionDays(start, index));
}

export function formatNutritionDateAriaLabel(dateKey: string) {
  return new Intl.DateTimeFormat(NUTRITION_DATE_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(nutritionDateFromKey(dateKey));
}

export function formatNutritionWeekday(dateKey: string) {
  return new Intl.DateTimeFormat(NUTRITION_DATE_LOCALE, {
    weekday: "short",
  }).format(nutritionDateFromKey(dateKey));
}

export function formatNutritionMonthLabel(dateKey: string) {
  return new Intl.DateTimeFormat(NUTRITION_DATE_LOCALE, {
    month: "long",
    year: "numeric",
  }).format(nutritionDateFromKey(dateKey));
}
