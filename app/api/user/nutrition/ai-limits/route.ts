import { NextResponse } from "next/server";
import { getUserEntitlements } from "@/lib/entitlements";
import { getNutritionAiQuotas } from "@/lib/nutrition/ai-quota";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { entitlements } = await getUserEntitlements(userId);
  const quotas = await getNutritionAiQuotas(userId, entitlements.isPro);
  return NextResponse.json({ isPro: entitlements.isPro, describe: quotas.describe, ...(quotas.aiScan ? { aiScan: quotas.aiScan } : {}) });
}
