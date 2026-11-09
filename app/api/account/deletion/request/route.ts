import { NextResponse } from "next/server";
import { attemptAppleAuthorizationRevocation, deactivateAccountForDeletion } from "@/lib/account-deletion";
import { getDatabaseSessionFromRequest, isRecentAuthentication } from "@/lib/auth/database-session";
import { getAuthSessionCookieName, getNativeAuthCookieOptions } from "@/lib/auth/native-auth-server";
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { isAccountDeletionRequestsEnabled } from "@/lib/account-deletion-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAccountDeletionRequestsEnabled()) {
    return NextResponse.json({ error: "Account deletion is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid deletion request." }, { status: 403 });
  }

  const session = await getDatabaseSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!isRecentAuthentication(session.authenticatedAt)) {
    return NextResponse.json({ error: "RECENT_AUTH_REQUIRED" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { confirmation?: unknown }
    | null;
  if (body?.confirmation !== "DELETE_MY_ACCOUNT") {
    return NextResponse.json({ error: "EXPLICIT_CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  const result = await deactivateAccountForDeletion(session.userId);
  if (result.state === "USER_NOT_FOUND") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (result.state === "INCONSISTENT_STATE") {
    return NextResponse.json({ error: "DELETION_STATE_CONFLICT" }, { status: 409 });
  }
  if (result.state === "DEACTIVATED") {
    try {
      await attemptAppleAuthorizationRevocation(session.userId);
    } catch {
      // Deactivation and session revocation have committed. A later durable
      // worker can retry this restricted revocation state.
      console.warn("[account-deletion] Apple authorization revocation deferred");
    }
  }

  const response = NextResponse.json(
    {
      ok: true,
      status: result.state,
      cleanupDeadline: result.cleanupDeadline.toISOString(),
      personalDataCleanupPending: true,
    },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(getAuthSessionCookieName(), "", {
    ...getNativeAuthCookieOptions(0),
    expires: new Date(0),
  });
  return response;
}
