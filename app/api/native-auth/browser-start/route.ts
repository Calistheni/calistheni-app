import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSessionCookieName,
  getNativeAuthCookieOptions,
  hashNativeAuthSecret,
  logNativeAuth,
  setNativeAuthAttemptCookie,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt");
  const nonce = url.searchParams.get("nonce");
  const intent = url.searchParams.get("intent");
  if (!attemptId || !nonce || intent !== "login") {
    return NextResponse.redirect(
      new URL("/login?nativeAuthError=invalid", getSiteUrl())
    );
  }

  const attempt = await prisma.nativeAuthAttempt.findFirst({
    where: {
      id: attemptId,
      nonceHash: hashNativeAuthSecret(nonce),
      expiresAt: { gt: new Date() },
      consumedAt: null,
      handoffCodeHash: null,
    },
    select: { id: true },
  });
  if (!attempt) {
    logNativeAuth("browser_start_rejected", { attemptId });
    return NextResponse.redirect(
      new URL("/login?nativeAuthError=expired", getSiteUrl())
    );
  }

  const startPage = new URL("/mobile/auth/start", getSiteUrl());
  startPage.searchParams.set("attempt", attempt.id);
  startPage.searchParams.set("nonce", nonce);
  const response = NextResponse.redirect(startPage);
  // Capacitor Browser and WKWebView have separate cookie jars. A normal
  // in-app logout clears the WKWebView session, but this Browser cookie can
  // still authenticate the next Auth.js callback as the old user. Clear only
  // Calistheni's Browser-session cookie before a fresh login; Google itself
  // stays signed in and `select_account` can present every Google account.
  response.cookies.set(getAuthSessionCookieName(), "", {
    ...getNativeAuthCookieOptions(0),
    expires: new Date(0),
  });
  setNativeAuthAttemptCookie(response, attempt.id, nonce);
  logNativeAuth("external_login_context_cleared", { attemptId, intent });
  logNativeAuth("external_authorization_started", { attemptId, intent });
  return response;
}
