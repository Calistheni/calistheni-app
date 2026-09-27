import { NextResponse } from "next/server";
import { getOrCreateAppleBillingAccount } from "@/lib/apple-iap/account";
import { getApplePublicConfiguration } from "@/lib/apple-iap/config";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { nativeCorsPreflight, withNativeCors } from "@/lib/native-api-cors";

export const runtime = "nodejs";

export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return withNativeCors(request, createUserUnauthorizedResponse());

  try {
    const configuration = getApplePublicConfiguration();
    const account = await getOrCreateAppleBillingAccount(userId);
    return withNativeCors(request, NextResponse.json({
      appAccountToken: account.appAccountToken,
      productIds: configuration.productIds,
    }));
  } catch (error) {
    console.error("[billing.apple.config] failed", {
      userId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return withNativeCors(request, NextResponse.json(
      {
        code: "APPLE_CONFIG_UNAVAILABLE",
        error: "Apple purchase configuration is unavailable right now.",
      },
      { status: 500 }
    ));
  }
}
