import { NextResponse } from "next/server";
import {
  canUseNutritionAiScan,
  canUseNutritionBarcodeScan,
  getUserEntitlements,
} from "@/lib/entitlements";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

/** Loaded with the on-demand food picker, never on base Nutrition navigation. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { entitlements } = await getUserEntitlements(userId);
  return NextResponse.json({
    canUseAiScan: canUseNutritionAiScan(entitlements),
    canUseBarcodeScan: canUseNutritionBarcodeScan(entitlements),
  });
}
