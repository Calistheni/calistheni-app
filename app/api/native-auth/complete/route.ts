import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NATIVE_AUTH_CALLBACK_PATH } from "@/lib/auth/native-auth";
import {
  clearNativeAuthAttemptCookie,
  hashNativeAuthSecret,
  logNativeAuth,
  NATIVE_AUTH_HANDOFF_TTL_MS,
  NATIVE_AUTH_BROWSER_COOKIE,
  parseNativeAuthAttemptCookie,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";
import { getDatabaseSessionFromRequest, readAuthSessionToken } from "@/lib/auth/database-session";
import { hashAuthSecret } from "@/lib/auth/security";
import { getAuthSessionCookieName, getNativeAuthCookieOptions } from "@/lib/auth/native-auth-server";

export const runtime = "nodejs";

function errorRedirect(code: string) {
  const url = new URL(NATIVE_AUTH_CALLBACK_PATH, getSiteUrl());
  url.searchParams.set("error", code);
  return url;
}

function createHandoffRedirect(attemptId: string) {
  const callbackUrl = new URL(NATIVE_AUTH_CALLBACK_PATH, getSiteUrl());
  // Both app-held proofs are required before any session or link can be created.
  callbackUrl.searchParams.set("attempt", attemptId);
  const response = NextResponse.redirect(callbackUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  clearNativeAuthAttemptCookie(response);
  return response;
}

export async function GET(request: Request) {
  const browserAttempt = parseNativeAuthAttemptCookie(
    request.headers.get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${NATIVE_AUTH_BROWSER_COOKIE}=`))
      ?.slice(NATIVE_AUTH_BROWSER_COOKIE.length + 1)
  );
  if (!browserAttempt) {
    logNativeAuth("provider_callback_rejected", {});
    const response = NextResponse.redirect(errorRedirect("authentication_failed"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const { attemptId, nonce } = browserAttempt;
  const expectedAttempt = await prisma.nativeAuthAttempt.findFirst({
    where: {
      id: attemptId, nonceHash: hashNativeAuthSecret(nonce), expiresAt: { gt: new Date() },
      browserStartedAt: { not: null }, consumedAt: null,
      verifierChallenge: { not: null },
      OR: [
        { intent: "REAUTH", handoffIssuedAt: { not: null } },
        { intent: { not: "REAUTH" }, handoffIssuedAt: null },
      ],
    },
    select: { intent: true, userId: true, browserStartedAt: true },
  });
  if (!expectedAttempt) {
    const response = NextResponse.redirect(errorRedirect("attempt_expired"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }
  if (expectedAttempt.intent === "REAUTH") return createHandoffRedirect(attemptId);
  const session = expectedAttempt.intent === "LINK" ? null : await getDatabaseSessionFromRequest(request);
  let authenticatedUserId = session?.authProvider === "google" && session.authenticatedAt &&
    expectedAttempt.browserStartedAt && session.authenticatedAt >= expectedAttempt.browserStartedAt
    ? session.userId
    : null;

  if (expectedAttempt.intent === "LINK" && expectedAttempt.userId) {
    const linkSessionToken = readAuthSessionToken(request);
    const now = new Date();
    const linkSession = linkSessionToken
      ? await prisma.session.findFirst({
          where: {
            sessionToken: linkSessionToken,
            userId: expectedAttempt.userId,
            purpose: "OAUTH_LINK",
            expires: { gt: now },
          },
          select: { sessionToken: true },
        })
      : null;
    const completedIntent = linkSession
      ? await prisma.authLinkIntent.findFirst({
          where: {
            userId: expectedAttempt.userId,
            provider: "google",
            sessionTokenHash: hashAuthSecret(linkSession.sessionToken),
            consumedAt: { not: null },
            expiresAt: { gt: now },
            nativeAuthAttemptId: attemptId,
            pendingProviderAccountId: { not: null },
          },
          select: { id: true },
        })
      : null;
    if (!linkSession || !completedIntent) {
      logNativeAuth("provider_link_rejected", {});
      const response = NextResponse.redirect(errorRedirect("account_mismatch"));
      clearNativeAuthAttemptCookie(response);
      return response;
    }
    authenticatedUserId = expectedAttempt.userId;
  }

  if (!authenticatedUserId) {
    logNativeAuth("provider_callback_rejected", {});
    const response = NextResponse.redirect(errorRedirect("authentication_failed"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${authenticatedUserId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return { count: 0 };
    return tx.nativeAuthAttempt.updateMany({
      where: {
        id: attemptId,
        nonceHash: hashNativeAuthSecret(nonce),
        expiresAt: { gt: now },
        handoffIssuedAt: null,
        verifierChallenge: { not: null },
        consumedAt: null,
        ...(expectedAttempt.intent === "LINK" ? { userId: authenticatedUserId } : {}),
      },
      data: {
        userId: authenticatedUserId,
        handoffIssuedAt: now,
        // The pre-OAuth attempt has a longer setup lifetime; the usable browser
        // handoff itself is intentionally limited to five minutes.
        expiresAt: new Date(now.getTime() + NATIVE_AUTH_HANDOFF_TTL_MS),
      },
    });
  });

  if (updated.count !== 1) {
    logNativeAuth("handoff_issue_rejected", {});
    const response = NextResponse.redirect(errorRedirect("attempt_expired"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const response = createHandoffRedirect(attemptId);
  if (expectedAttempt.intent === "LINK") {
    const linkSessionToken = readAuthSessionToken(request);
    if (linkSessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken: linkSessionToken, purpose: "OAUTH_LINK" } });
    }
    response.cookies.set(getAuthSessionCookieName(), "", {
      ...getNativeAuthCookieOptions(0),
      expires: new Date(0),
    });
  }
  logNativeAuth("handoff_issued", {});
  return response;
}
