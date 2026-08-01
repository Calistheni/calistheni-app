import { NextResponse } from "next/server";
import { createJsonErrorResponse } from "@/lib/api-response";
import { externalFoodDetail } from "@/lib/nutrition/food-detail";
import { normalizeBarcode } from "@/lib/nutrition/normalization";
import { ProviderError } from "@/lib/nutrition/providers/http";
import { getOpenFoodFactsProduct } from "@/lib/nutrition/providers/open-food-facts";
import { getUsdaFood, normalizeUsdaFdcId } from "@/lib/nutrition/providers/usda";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ provider: string; externalId: string }> }) {
  if (!(await getAuthenticatedUserId())) return createUserUnauthorizedResponse();
  const { provider, externalId } = await params;
  if (provider !== "USDA" && provider !== "OPEN_FOOD_FACTS") return createJsonErrorResponse("Unsupported food provider.", 400, "INVALID_PROVIDER");
  try {
    const food = provider === "USDA"
      ? await getUsdaFood(normalizeUsdaFdcId(externalId))
      : await getOpenFoodFactsProduct(normalizeBarcode(externalId) ?? "");
    return NextResponse.json(externalFoodDetail(food));
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "UNAVAILABLE";
    const status = code === "INVALID_IDENTIFIER" ? 400 : code === "NOT_FOUND" ? 404 : code === "RATE_LIMITED" ? 429 : code === "TIMEOUT" ? 503 : code === "INVALID_RESPONSE" ? 502 : 503;
    return NextResponse.json({ error: { code: `FOOD_DETAIL_${code}`, message: status === 404 ? "Food details were not found." : status === 400 ? "Invalid food identifier." : "Unable to load complete food details. The preview is still available." } }, { status });
  }
}
