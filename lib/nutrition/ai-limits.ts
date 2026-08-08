export const NUTRITION_AI_LIMITS = {
  FREE: { describePerDay: 20 },
  PRO: { describePerDay: 200, aiScanPerDay: 100 },
} as const;

export type NutritionAiFeature = "describe" | "aiScan";

export function nutritionAiDailyLimit(
  feature: NutritionAiFeature,
  isPro: boolean
) {
  if (feature === "describe")
    return isPro
      ? NUTRITION_AI_LIMITS.PRO.describePerDay
      : NUTRITION_AI_LIMITS.FREE.describePerDay;
  return NUTRITION_AI_LIMITS.PRO.aiScanPerDay;
}
