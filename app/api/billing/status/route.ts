import { NextResponse } from "next/server";
import { getUserEntitlements } from "@/lib/entitlements";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  const { entitlements, grants } = await getUserEntitlements(userId);
  return NextResponse.json({
    isPro: entitlements.isPro,
    grants: grants.map((grant) => ({
      ...grant,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
    })),
  });
}
