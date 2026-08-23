import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { ProviderError } from "@/lib/nutrition/providers/http";
import { normalizeBarcode } from "@/lib/nutrition/normalization";
import { normalizeUsdaFdcId } from "@/lib/nutrition/providers/usda";
import { normalizeFineliId } from "@/lib/nutrition/providers/fineli";
import { importExternalFood, toFoodSummary } from "@/lib/nutrition/service";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
const schema = z.object({ provider: z.enum(["FINELI", "USDA", "OPEN_FOOD_FACTS"]), externalId: z.string().trim().min(1).max(100) });
export async function POST(request: Request) {
  if (!(await getAuthenticatedUserId())) return createUserUnauthorizedResponse();

  const payload = schema.safeParse(await request.json());
  if (!payload.success) return createJsonErrorResponse("Invalid food import request.", 400, "INVALID_FOOD_IMPORT");

  try {
    let externalId: string;
    if (payload.data.provider === "FINELI") {
      externalId = normalizeFineliId(payload.data.externalId);
    } else if (payload.data.provider === "USDA") {
      externalId = normalizeUsdaFdcId(payload.data.externalId);
    } else {
      const barcode = normalizeBarcode(payload.data.externalId);
      if (!barcode) throw new ProviderError("INVALID_IDENTIFIER", "Invalid barcode.");
      externalId = barcode;
    }
    const imported = await importExternalFood(payload.data.provider, externalId);
    const food = await prisma.food.findUniqueOrThrow({
      where: { id: imported.id },
      include: {
        aliases: { select: { name: true } },
        details: { select: { categories: true, productImageUrl: true } },
        servings: { select: { name: true, quantity: true, grams: true, householdUnit: true, isDefault: true } },
      },
    });
    return NextResponse.json({ food: toFoodSummary(food) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProviderError) {
      const providerName = payload.data.provider === "FINELI" ? "Fineli" : payload.data.provider === "USDA" ? "USDA" : "Open Food Facts";
      const providerCode = payload.data.provider === "FINELI" ? "FINELI" : payload.data.provider === "USDA" ? "USDA" : "OPEN_FOOD_FACTS";
      const response =
        error.code === "INVALID_IDENTIFIER"
          ? { status: 400, code: payload.data.provider === "FINELI" ? "INVALID_FINELI_ID" : payload.data.provider === "USDA" ? "INVALID_USDA_FDC_ID" : "INVALID_BARCODE", message: payload.data.provider === "FINELI" ? "Select a Fineli result and try again." : payload.data.provider === "USDA" ? "Select a USDA result and try again." : "Invalid barcode." }
          : error.code === "NOT_FOUND"
            ? { status: 404, code: `${providerCode}_NOT_FOUND`, message: `This ${providerName} food record could not be retrieved. Refresh the search results and try again.` }
          : error.code === "RATE_LIMITED"
              ? { status: 429, code: `${providerCode}_RATE_LIMITED`, message: `${providerName} is temporarily busy. Please try again shortly.` }
          : error.code === "TIMEOUT"
                ? { status: 503, code: `${providerCode}_UNAVAILABLE`, message: `${providerName} did not respond in time. Please try again.` }
                : error.code === "INVALID_RESPONSE"
                  ? { status: 502, code: `${providerCode}_INVALID_RESPONSE`, message: `${providerName} returned an unexpected response. Please try again later.` }
                : error.code === "INCOMPLETE_DATA"
                  ? { status: 422, code: `${providerCode}_INCOMPLETE_DATA`, message: `This ${providerName} record does not contain usable nutrition data.` }
                  : { status: 503, code: `${providerCode}_UNAVAILABLE`, message: `${providerName} is currently unavailable. Please try again later.` };
      console.warn("NUTRITION_IMPORT_PROVIDER_ERROR", { provider: payload.data.provider, code: error.code });
      return NextResponse.json({ error: { code: response.code, message: response.message } }, { status: response.status });
    }
    console.error("NUTRITION_IMPORT_FAILED", { provider: payload.data.provider, externalId: payload.data.externalId, error });
    return createInternalServerErrorResponse("NUTRITION_IMPORT_FAILED");
  }
}
