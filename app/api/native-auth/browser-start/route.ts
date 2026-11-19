import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSessionCookieName,
  getNativeAuthCookieOptions,
  hashNativeAuthSecret,
  logNativeAuth,
  setNativeAuthAttemptCookie,
  createNativeAuthSecret,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";
import { AUTH_LINK_COOKIE } from "@/lib/auth/account-linking";
import { hashAuthSecret } from "@/lib/auth/security";
import { isNativeAuthAttemptId } from "@/lib/auth/native-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt");
  const nonce = createNativeAuthSecret();
  const intent = url.searchParams.get("intent");
  if (!isNativeAuthAttemptId(attemptId) ||
      (intent !== "login" && intent !== "link" && intent !== "reauth" && intent !== "bearer_login")) {
    return NextResponse.redirect(
      new URL("/login?nativeAuthError=invalid", getSiteUrl())
    );
  }

  const attempt = await prisma.nativeAuthAttempt.findFirst({
    where: {
      id: attemptId,
      verifierChallenge: { not: null },
      expiresAt: { gt: new Date() },
      consumedAt: null,
      handoffIssuedAt: null,
      browserStartedAt: null,
    },
    select: { id: true, intent: true, userId: true },
  });
  if (!attempt || attempt.intent.toLowerCase() !== intent ||
      ((intent === "link" || intent === "reauth") && !attempt.userId)) {
    logNativeAuth("browser_start_rejected", {});
    return NextResponse.redirect(
      new URL("/login?nativeAuthError=expired", getSiteUrl())
    );
  }
  const claimed = await prisma.nativeAuthAttempt.updateMany({
    where: { id: attempt.id, browserStartedAt: null, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { browserStartedAt: new Date(), nonceHash: hashNativeAuthSecret(nonce) },
  });
  if (claimed.count !== 1) {
    return NextResponse.redirect(new URL("/login?nativeAuthError=expired", getSiteUrl()));
  }

  const startPage = new URL("/mobile/auth/start", getSiteUrl());
  const response = NextResponse.redirect(startPage, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  // Capacitor Browser and WKWebView have separate cookie jars. A normal
  // in-app logout clears the WKWebView session, but this Browser cookie can
  // still authenticate the next Auth.js callback as the old user. Clear only
  // Calistheni's Browser-session cookie before a fresh login; Google itself
  // stays signed in and `select_account` can present every Google account.
  if (attempt.intent === "LINK" && attempt.userId) {
    const externalSessionToken = createNativeAuthSecret();
    const linkSecret = createNativeAuthSecret();
    const linkContextCreated = await prisma.$transaction(async (tx) => {
      const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User"
        WHERE "id" = ${attempt.userId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!activeUser.length) return false;
      await tx.session.create({
        data: {
          sessionToken: externalSessionToken,
          userId: attempt.userId!,
          purpose: "OAUTH_LINK",
          authProvider: null,
          expires: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      await tx.authLinkIntent.create({
        data: {
          userId: attempt.userId!,
          provider: "google",
          secretHash: hashAuthSecret(linkSecret),
          sessionTokenHash: hashAuthSecret(externalSessionToken),
          nativeAuthAttemptId: attempt.id,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      return true;
    });
    if (!linkContextCreated) {
      return NextResponse.redirect(new URL("/login?nativeAuthError=expired", getSiteUrl()));
    }
    response.cookies.set(
      getAuthSessionCookieName(),
      externalSessionToken,
      getNativeAuthCookieOptions(10 * 60)
    );
    response.cookies.set(AUTH_LINK_COOKIE, linkSecret, getNativeAuthCookieOptions(10 * 60));
  } else {
    response.cookies.set(getAuthSessionCookieName(), "", {
      ...getNativeAuthCookieOptions(0),
      expires: new Date(0),
    });
  }
  setNativeAuthAttemptCookie(response, attempt.id, nonce);
  logNativeAuth("external_oauth_context_prepared", { intent });
  logNativeAuth("external_authorization_started", { intent });
  return response;
}
