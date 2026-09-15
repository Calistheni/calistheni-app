import { NextResponse } from "next/server";
import { getOrCreateAppleBillingAccount } from "@/lib/apple-iap/account";
import { getApplePublicConfiguration } from "@/lib/apple-iap/config";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  try {
    const configuration = getApplePublicConfiguration();
    const account = await getOrCreateAppleBillingAccount(userId);
    return NextResponse.json({
      appAccountToken: account.appAccountToken,
      productIds: configuration.productIds,
    });
  } catch (error) {
    console.error("[billing.apple.config] failed", {
      userId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        code: "APPLE_CONFIG_UNAVAILABLE",
        error: "Apple purchase configuration is unavailable right now.",
      },
      { status: 500 }
    );
  }
}
