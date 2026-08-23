import { NextResponse } from "next/server";
import { createJsonErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { canUseNutritionAiScan, getUserEntitlements } from "@/lib/entitlements";
import { analyzeNutritionImage, nutritionAiConfigured } from "@/lib/nutrition/ai-provider";
import { getNutritionAiQuotas, releaseNutritionAiQuota, reserveNutritionAiQuota } from "@/lib/nutrition/ai-quota";
import { resolveDescribedFoods } from "@/lib/nutrition/describe-resolver";
import { nutritionFoodIntent } from "@/lib/nutrition/food-intent";
import { normalizeFoodQuery } from "@/lib/nutrition/normalization";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SPECIES_CONFIDENCE_THRESHOLD = 0.85;
const MUSHROOM_SPECIES = /\b(?:shiitake|porcini|boletus|chanterelle|oyster|cremini|portobello)\b/;
const KNOWN_MUSHROOM_SPECIES = ["porcini", "shiitake", "chanterelle", "oyster", "cremini", "portobello"];
function conceptForVisionFood(food: Awaited<ReturnType<typeof analyzeNutritionImage>>["foods"][number], description: string | null) {
  const context = normalizeFoodQuery(description ?? "");
  const modelLabel = normalizeFoodQuery(food.label);
  const descriptionSpecies = modelLabel.includes("mushroom")
    ? KNOWN_MUSHROOM_SPECIES.find((candidate) => context.includes(candidate)) ?? null
    : null;
  const species = descriptionSpecies ?? food.speciesOrVariant?.trim() ?? null;
  const descriptionConfirmsSpecies = Boolean(species && context.includes(normalizeFoodQuery(species)));
  const speciesIsTrusted = food.specificityConfidence >= SPECIES_CONFIDENCE_THRESHOLD || descriptionConfirmsSpecies;
  const label = species && speciesIsTrusted
    ? `${species} ${food.label}`
    : !speciesIsTrusted && MUSHROOM_SPECIES.test(modelLabel) && modelLabel.includes("mushroom")
      ? "mushroom"
      : food.label;
  return {
    label,
    preparation: food.preparation,
    estimatedGrams: food.estimatedGrams,
    quantityText: food.quantityText,
  };
}
function validSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index]);
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { entitlements } = await getUserEntitlements(userId);
  if (!canUseNutritionAiScan(entitlements)) {
    return NextResponse.json(
      {
        error: "PRO_REQUIRED",
        feature: "nutrition_ai_scan",
        message: "AI Scan is available with Calistheni Pro.",
      },
      { status: 403 }
    );
  }
  const form = await request.formData(); const image = form.get("image"); const rawDescription = form.get("description");
  const description = typeof rawDescription === "string" && rawDescription.length ? rawDescription : null;
  if (!(image instanceof File) || image.size < 1 || image.size > MAX_IMAGE_BYTES) return createJsonErrorResponse("Choose an image smaller than 4 MB.", 400, "INVALID_IMAGE");
  if (description && description.length > 200) return createJsonErrorResponse("Description must be 200 characters or fewer.", 400, "INVALID_DESCRIPTION");
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!validSignature(bytes, image.type)) return createJsonErrorResponse("Use a JPEG, PNG, or WebP image.", 400, "INVALID_IMAGE");
  if (!nutritionAiConfigured()) return createJsonErrorResponse("AI food scanning is not configured. Set OPENAI_API_KEY on the server.", 503, "AI_NOT_CONFIGURED");
  const reservation = await reserveNutritionAiQuota(userId, true, "aiScan");
  if (!reservation) {
    const quota = (await getNutritionAiQuotas(userId, true)).aiScan!;
    return NextResponse.json({ error: "DAILY_LIMIT_REACHED", feature: "nutrition_ai_scan", limit: quota.limit, message: "You've reached today's AI Scan limit. Your quota resets tomorrow." }, { status: 429 });
  }
  try {
    const detected = await analyzeNutritionImage(Buffer.from(bytes), image.type, description);
    if (process.env.NODE_ENV === "development") {
      console.info("[Nutrition AI Scan] normalized foods", detected.foods.map((food) => ({
        label: conceptForVisionFood(food, description).label,
        preparation: food.preparation,
        speciesOrVariant: food.speciesOrVariant,
        visualConfidence: food.visualConfidence,
        specificityConfidence: food.specificityConfidence,
      })));
    }
    // Resolve on the server with the same local/provider candidate collector
    // used by Food search and Describe. This ranks before importing and only
    // imports the chosen winner, rather than asking the browser to make a
    // separate, stricter search for every visual label.
    const resolved = await resolveDescribedFoods(
      description ?? "",
      detected.foods.map((food) => conceptForVisionFood(food, description)), userId,
      { aiMealPhoto: true }
    );
    const foods = detected.foods.map((food, index) => {
      const concept = conceptForVisionFood(food, description);
      const match = resolved[index];
      return {
        ...food,
        ...concept,
        food: match?.food ?? null,
        matchConfidence: match?.confidence ?? null,
        needsReview: match?.needsReview ?? true,
        candidates: match?.candidates ?? [],
        // The browser can offer an explicit contribution only after the same
        // provider-backed resolver found no safe canonical match. It never
        // creates a Food record merely because vision was uncertain.
        missingIntent: match?.food ? null : nutritionFoodIntent(concept.label).canonicalName,
      };
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[Nutrition AI Scan] resolved review foods", foods.map((food) => ({
        label: food.label,
        visualConfidence: food.visualConfidence,
        matchConfidence: food.matchConfidence,
        match: food.food?.name ?? null,
        discarded: food.food ? null : "no-safe-canonical-match",
      })));
    }
    return NextResponse.json({ foods, notes: detected.notes });
  }
  catch (error) { await releaseNutritionAiQuota(reservation); const code = error instanceof Error ? error.message : "AI_UNAVAILABLE"; const malformed = code === "AI_MALFORMED_RESPONSE"; const rateLimited = code === "AI_RATE_LIMITED"; return createJsonErrorResponse(malformed ? "The food scan returned an invalid result. Try another photo." : rateLimited ? "AI food scanning is busy. Try again shortly." : "AI food scanning is temporarily unavailable.", malformed ? 502 : rateLimited ? 429 : 503, code); }
}
