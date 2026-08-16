import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { normalizeBarcode } from "@/lib/nutrition/normalization";
import { ProviderError } from "@/lib/nutrition/providers/http";
import { getOpenFoodFactsProduct } from "@/lib/nutrition/providers/open-food-facts";
import { toFoodSummary, withResolvedFoodIcon } from "@/lib/nutrition/service";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { canUseNutritionBarcodeScan, getUserEntitlements } from "@/lib/entitlements";
import { recordBarcodeLookup } from "@/lib/user-activity";
import { canUseNutritionFood } from "@/lib/nutrition/food-visibility";

export async function GET(_request: Request, { params }: { params: Promise<{ barcode: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { entitlements } = await getUserEntitlements(userId);
  if (!canUseNutritionBarcodeScan(entitlements)) {
    return NextResponse.json(
      {
        error: "PRO_REQUIRED",
        feature: "nutrition_barcode_scan",
        message: "Barcode scanning is available with Calistheni Pro.",
      },
      { status: 403 }
    );
  }

  const barcode = normalizeBarcode((await params).barcode);
  if (!barcode) return createJsonErrorResponse("Invalid barcode.", 400, "INVALID_BARCODE");

  try {
    if (process.env.NODE_ENV === "development") console.info("[Barcode] local lookup begin", { barcode });
    const local = await prisma.food.findUnique({ where: { barcode }, include: { aliases: { select: { name: true } }, details: { select: { categories: true, productImageUrl: true } }, servings: { select: { name: true, quantity: true, grams: true, householdUnit: true } } } });
    if (local && canUseNutritionFood(local, userId)) {
      if (process.env.NODE_ENV === "development") console.info("[Barcode] local result found", { barcode, foodId: local.id });
      if (process.env.NODE_ENV === "development") console.info("[FoodVisibility]", { barcode, status: local.contributionStatus, createdBy: local.createdByUserId, requestUser: userId, creatorVisible: local.contributionStatus === "PENDING" && local.createdByUserId === userId });
      if (process.env.NODE_ENV === "development" && local.contributionStatus === "PENDING") console.info("[BarcodeLookup] creator-pending-hit", { barcode, foodId: local.id });
      await recordBarcodeLookup({ userId, succeeded: true, foodId: local.id }).catch((error) => console.warn("NUTRITION_BARCODE_ACTIVITY_FAILED", { error }));
      const food = { ...toFoodSummary(local), isOwnContribution: local.createdByUserId === userId };
      return NextResponse.json({ status: "found", barcode, food, local: food, external: null });
    }

    if (process.env.NODE_ENV === "development") console.info("[Barcode] local result miss", { barcode });
    if (process.env.NODE_ENV === "development") console.info("[Barcode] OFF lookup begin", { barcode });
    const external = await getOpenFoodFactsProduct(barcode);
    if (process.env.NODE_ENV === "development") console.info("[Barcode] OFF result found", { barcode });
    await recordBarcodeLookup({ userId, succeeded: true }).catch((error) => console.warn("NUTRITION_BARCODE_ACTIVITY_FAILED", { error }));
    const food = { ...withResolvedFoodIcon(external), raw: undefined };
    return NextResponse.json({ status: "found", barcode, food, local: null, external: food });
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.code === "NOT_FOUND") {
        if (process.env.NODE_ENV === "development") console.info("[Barcode] OFF result not_found", { barcode });
        await recordBarcodeLookup({ userId, succeeded: false }).catch((activityError) => console.warn("NUTRITION_BARCODE_ACTIVITY_FAILED", { error: activityError }));
        return NextResponse.json({ status: "not_found", barcode, local: null, external: null });
      }
      const response =
        error.code === "INVALID_IDENTIFIER"
          ? { status: 400, code: "INVALID_BARCODE", message: "Invalid barcode." }
          : error.code === "RATE_LIMITED"
              ? { status: 429, code: "OPEN_FOOD_FACTS_RATE_LIMITED", message: "Open Food Facts is temporarily busy. Please try again shortly." }
              : error.code === "TIMEOUT"
                ? { status: 503, code: "OPEN_FOOD_FACTS_UNAVAILABLE", message: "Open Food Facts did not respond in time. Please try again." }
                : error.code === "INVALID_RESPONSE"
                  ? { status: 502, code: "OPEN_FOOD_FACTS_INVALID_RESPONSE", message: "Open Food Facts returned an unexpected response. Please try again later." }
                  : { status: 503, code: "OPEN_FOOD_FACTS_UNAVAILABLE", message: "Open Food Facts is currently unavailable. Please try again later." };
      console.warn("NUTRITION_BARCODE_PROVIDER_ERROR", { code: error.code });
      if (process.env.NODE_ENV === "development") console.info("[Barcode] OFF result error", { barcode, code: error.code });
      await recordBarcodeLookup({ userId, succeeded: false }).catch((activityError) => console.warn("NUTRITION_BARCODE_ACTIVITY_FAILED", { error: activityError }));
      return NextResponse.json({ error: { code: response.code, message: response.message } }, { status: response.status });
    }

    console.error("NUTRITION_BARCODE_FAILED", { barcode, error });
    return createInternalServerErrorResponse("NUTRITION_BARCODE_FAILED");
  }
}
