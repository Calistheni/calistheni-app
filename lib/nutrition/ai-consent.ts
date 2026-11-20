const consentHeader = "X-Calistheni-Nutrition-AI-Consent";

export const NUTRITION_AI_CONSENT_HEADERS = {
  [consentHeader]: "1",
} as const;

export function hasNutritionAiConsent(headers: Headers) {
  return headers.get(consentHeader) === NUTRITION_AI_CONSENT_HEADERS[consentHeader];
}
