import { consumeLoginBudget } from "@/lib/auth/rate-limit";
import { NextResponse } from "next/server";
import {
  isNativeAuthPlatform,
  isNativeAuthVerifierChallenge,
} from "@/lib/auth/native-auth";
import { logNativeAuth } from "@/lib/auth/native-auth-server";
import { createNativeGoogleAttempt } from "@/lib/auth/native-auth-attempt";
import { getSiteUrl } from "@/lib/site-url";
import { getDatabaseSessionFromRequest, isRecentAuthentication } from "@/lib/auth/database-session";

export const runtime = "nodejs";

function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(getSiteUrl()).origin;
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      {
        error: "Native authentication must start from Calistheni.",
        code: "NATIVE_AUTH_ORIGIN_INVALID",
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        error: "Invalid native authentication request.",
        code: "NATIVE_AUTH_REQUEST_INVALID",
      },
      { status: 400 }
    );
  }

  if (!isNativeAuthPlatform(body.platform)) {
    return NextResponse.json(
      {
        error: "Unsupported native platform.",
        code: "NATIVE_AUTH_PLATFORM_INVALID",
      },
      { status: 400 }
    );
  }
  if (body.intent !== "login" && body.intent !== "link" && body.intent !== "reauth") {
    return NextResponse.json(
      {
        error: "Unsupported native authentication intent.",
        code: "NATIVE_AUTH_INTENT_INVALID",
      },
      { status: 400 }
    );
  }
  if (!isNativeAuthVerifierChallenge(body.verifierChallenge)) {
    return NextResponse.json({ error: "Invalid native authentication request." }, { status: 400 });
  }
  try {
    const budget = await consumeLoginBudget(request, "native-google");
    if (!budget.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, {
      status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) },
    });
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
  const verifierChallenge = body.verifierChallenge;
  const platform = body.platform;
  const linkingSession = body.intent !== "login" ? await getDatabaseSessionFromRequest(request) : null;
  if (body.intent !== "login" && (!linkingSession ||
    (body.intent === "link" && !isRecentAuthentication(linkingSession.authenticatedAt)))) {
    return NextResponse.json(
      { error: "Sign in again before connecting Google.", code: "RECENT_AUTH_REQUIRED" },
      { status: 403 }
    );
  }

  const { attemptId, handoffCode } = await createNativeGoogleAttempt({
    platform,
    intent: body.intent === "link" ? "LINK" : body.intent === "reauth" ? "REAUTH" : "LOGIN",
    userId: linkingSession?.userId,
    verifierChallenge,
    initiatingSessionHash: linkingSession?.sessionTokenHash,
    redirectTo: body.redirectTo,
  });

  const startUrl = new URL("/api/native-auth/browser-start", getSiteUrl());
  startUrl.searchParams.set("attempt", attemptId);
  startUrl.searchParams.set("intent", body.intent);

  logNativeAuth("attempt_created", {
    platform,
    intent: body.intent,
  });

  return NextResponse.json({
    attemptId,
    handoffCode,
    externalAuthUrl: startUrl.toString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
