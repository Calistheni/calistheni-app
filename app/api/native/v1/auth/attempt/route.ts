import {
  isNativeAuthPlatform,
  isNativeAuthVerifierChallenge,
} from "@/lib/auth/native-auth";
import { logNativeAuth } from "@/lib/auth/native-auth-server";
import { createNativeGoogleAttempt } from "@/lib/auth/native-auth-attempt";
import { nativeCorsJson, nativeCorsPreflight, rejectDisallowedNativeOrigin } from "@/lib/native-api-cors";
import { getSiteUrl } from "@/lib/site-url";
import { consumeLoginBudget } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function POST(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const body = await request.json().catch(() => null);
  if (!body || !isNativeAuthVerifierChallenge(body.verifierChallenge)) {
    return nativeCorsJson(request, { error: "Invalid authentication request.", code: "NATIVE_AUTH_REQUEST_INVALID" }, { status: 400 });
  }
  if (!isNativeAuthPlatform(body.platform)) {
    return nativeCorsJson(request, { error: "Unsupported native platform.", code: "NATIVE_AUTH_PLATFORM_INVALID" }, { status: 400 });
  }
  try {
    const budget = await consumeLoginBudget(request, "native-google");
    if (!budget.allowed) return nativeCorsJson(request, { error: "Too many attempts. Try again later." }, {
      status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) },
    });
  } catch {
    return nativeCorsJson(request, { error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
  const { attemptId, handoffCode } = await createNativeGoogleAttempt({
    platform: body.platform,
    intent: "BEARER_LOGIN",
    verifierChallenge: body.verifierChallenge,
    redirectTo: body.redirectTo,
  });
  const externalAuthUrl = new URL("/api/native-auth/browser-start", getSiteUrl());
  externalAuthUrl.searchParams.set("attempt", attemptId);
  externalAuthUrl.searchParams.set("intent", "bearer_login");
  logNativeAuth("bearer_attempt_created", { platform: body.platform });
  return nativeCorsJson(request, { attemptId, handoffCode, externalAuthUrl: externalAuthUrl.toString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
