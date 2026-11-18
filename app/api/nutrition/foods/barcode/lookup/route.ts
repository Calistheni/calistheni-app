import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { canUseNutritionBarcodeScan, getUserEntitlements } from "@/lib/entitlements";
import { normalizeBarcode } from "@/lib/nutrition/normalization";
import { canUseNutritionFood } from "@/lib/nutrition/food-visibility";
import { ProviderError } from "@/lib/nutrition/providers/http";
import { getOpenFoodFactsProduct } from "@/lib/nutrition/providers/open-food-facts";
import { prisma } from "@/lib/prisma";
import { recordBarcodeLookup } from "@/lib/user-activity";
import { toFoodSummary, withResolvedFoodIcon } from "@/lib/nutrition/service";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid barcode.", 400, "INVALID_BARCODE");
  }
  const submittedBarcode =
    body && typeof body === "object" && !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).barcode === "string"
      ? (body as { barcode: string }).barcode
      : "";
  const barcode = normalizeBarcode(submittedBarcode);
  if (!barcode) {
    return createJsonErrorResponse("Invalid barcode.", 400, "INVALID_BARCODE");
  }

  try {
    const local = await prisma.food.findUnique({
      where: { barcode },
      include: {
        aliases: { select: { name: true } },
        details: { select: { categories: true, productImageUrl: true } },
        servings: { select: { name: true, quantity: true, grams: true, householdUnit: true } },
      },
    });
    if (local && canUseNutritionFood(local, userId)) {
      await recordBarcodeLookup({ userId, succeeded: true, foodId: local.id }).catch(() => undefined);
      const food = { ...toFoodSummary(local), isOwnContribution: local.createdByUserId === userId };
      return NextResponse.json({ status: "found", barcode, food, local: food, external: null }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const external = await getOpenFoodFactsProduct(barcode);
    await recordBarcodeLookup({ userId, succeeded: true }).catch(() => undefined);
    const food = { ...withResolvedFoodIcon(external), raw: undefined };
    return NextResponse.json({ status: "found", barcode, food, local: null, external: food }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.code === "NOT_FOUND") {
        await recordBarcodeLookup({ userId, succeeded: false }).catch(() => undefined);
        return NextResponse.json({ status: "not_found", barcode, local: null, external: null }, {
          headers: { "Cache-Control": "private, no-store" },
        });
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
      await recordBarcodeLookup({ userId, succeeded: false }).catch(() => undefined);
      return NextResponse.json({ error: { code: response.code, message: response.message } }, {
        status: response.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    console.error("NUTRITION_BARCODE_FAILED");
    return createInternalServerErrorResponse("NUTRITION_BARCODE_FAILED");
  }
}
