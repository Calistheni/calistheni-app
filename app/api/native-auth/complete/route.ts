import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NATIVE_AUTH_CALLBACK_PATH } from "@/lib/auth/native-auth";
import {
  clearNativeAuthAttemptCookie,
  createNativeAuthSecret,
  hashNativeAuthSecret,
  logNativeAuth,
  parseNativeAuthAttemptCookie,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";
import { readAuthSessionToken } from "@/lib/auth/database-session";
import { hashAuthSecret } from "@/lib/auth/security";
import { getAuthSessionCookieName, getNativeAuthCookieOptions } from "@/lib/auth/native-auth-server";

export const runtime = "nodejs";
const HANDOFF_TTL_MS = 5 * 60 * 1000;

function errorRedirect(code: string) {
  const url = new URL(NATIVE_AUTH_CALLBACK_PATH, getSiteUrl());
  url.searchParams.set("error", code);
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const attemptId = requestUrl.searchParams.get("attempt");
  const nonce = requestUrl.searchParams.get("nonce");
  const browserAttempt = parseNativeAuthAttemptCookie(
    request.headers.get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("calistheni.native-auth-attempt="))
      ?.slice("calistheni.native-auth-attempt=".length)
  );
  if (
    !attemptId ||
    !nonce ||
    !browserAttempt ||
    browserAttempt.attemptId !== attemptId ||
    browserAttempt.nonce !== nonce
  ) {
    logNativeAuth("provider_callback_rejected", { attemptId: attemptId ?? "missing" });
    const response = NextResponse.redirect(errorRedirect("authentication_failed"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const expectedAttempt = await prisma.nativeAuthAttempt.findUnique({
    where: { id: attemptId },
    select: { intent: true, userId: true },
  });
  const session = expectedAttempt?.intent === "LINK" ? null : await auth();
  let authenticatedUserId = session?.user?.id ?? null;

  if (expectedAttempt?.intent === "LINK" && expectedAttempt.userId) {
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
      logNativeAuth("provider_link_rejected", { attemptId });
      const response = NextResponse.redirect(errorRedirect("account_mismatch"));
      clearNativeAuthAttemptCookie(response);
      return response;
    }
    authenticatedUserId = expectedAttempt.userId;
  }

  if (!authenticatedUserId) {
    logNativeAuth("provider_callback_rejected", { attemptId });
    const response = NextResponse.redirect(errorRedirect("authentication_failed"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const handoffCode = createNativeAuthSecret();
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
        handoffCodeHash: null,
        consumedAt: null,
        ...(expectedAttempt?.intent === "LINK" ? { userId: authenticatedUserId } : {}),
      },
      data: {
        userId: authenticatedUserId,
        handoffCodeHash: hashNativeAuthSecret(handoffCode),
        handoffIssuedAt: now,
        // The pre-OAuth attempt has a longer setup lifetime; the usable browser
        // handoff itself is intentionally limited to five minutes.
        expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS),
      },
    });
  });

  if (updated.count !== 1) {
    logNativeAuth("handoff_issue_rejected", { attemptId });
    const response = NextResponse.redirect(errorRedirect("attempt_expired"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const callbackUrl = new URL(NATIVE_AUTH_CALLBACK_PATH, getSiteUrl());
  callbackUrl.searchParams.set("code", handoffCode);
  const response = NextResponse.redirect(callbackUrl);
  if (expectedAttempt?.intent === "LINK") {
    const linkSessionToken = readAuthSessionToken(request);
    if (linkSessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken: linkSessionToken, purpose: "OAUTH_LINK" } });
    }
    response.cookies.set(getAuthSessionCookieName(), "", {
      ...getNativeAuthCookieOptions(0),
      expires: new Date(0),
    });
  }
  clearNativeAuthAttemptCookie(response);
  logNativeAuth("handoff_issued", { attemptId, userId: authenticatedUserId });
  return response;
}
