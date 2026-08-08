const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

type RateLimitState = {
  count: number;
  resetAt: number;
};

const globalForNutritionAi = globalThis as typeof globalThis & {
  nutritionAiRateLimits?: Map<string, RateLimitState>;
};

const nutritionAiRateLimits =
  globalForNutritionAi.nutritionAiRateLimits ??
  new Map<string, RateLimitState>();

if (!globalForNutritionAi.nutritionAiRateLimits) {
  globalForNutritionAi.nutritionAiRateLimits = nutritionAiRateLimits;
}

export function consumeNutritionAiRateLimit(
  userId: string,
  now = Date.now()
) {
  const current = nutritionAiRateLimits.get(userId);

  if (!current || current.resetAt <= now) {
    nutritionAiRateLimits.set(userId, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return null;
  }

  if (current.count >= MAX_REQUESTS) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  nutritionAiRateLimits.set(userId, {
    ...current,
    count: current.count + 1,
  });
  return null;
}

export function resetNutritionAiRateLimitForTests(userId: string) {
  nutritionAiRateLimits.delete(userId);
}
