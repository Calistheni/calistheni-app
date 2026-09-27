import { prisma } from "@/lib/prisma";
import {
  NATIVE_AUTH_ATTEMPT_TTL_MS,
  isNativeAuthPlatform,
  sanitizeNativeRedirectPath,
} from "@/lib/auth/native-auth";
import {
  createNativeAuthSecret,
  hashNativeAuthSecret,
  logNativeAuth,
} from "@/lib/auth/native-auth-server";
import { nativeCorsJson, nativeCorsPreflight, rejectDisallowedNativeOrigin } from "@/lib/native-api-cors";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function POST(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  let body: { platform?: unknown; redirectTo?: unknown };
  try { body = await request.json(); } catch {
    return nativeCorsJson(request, { error: "Invalid authentication request.", code: "NATIVE_AUTH_REQUEST_INVALID" }, { status: 400 });
  }
  if (!isNativeAuthPlatform(body.platform)) {
    return nativeCorsJson(request, { error: "Unsupported native platform.", code: "NATIVE_AUTH_PLATFORM_INVALID" }, { status: 400 });
  }
  const now = new Date();
  const nonce = createNativeAuthSecret();
  const attempt = await prisma.nativeAuthAttempt.create({
    data: {
      platform: body.platform,
      nonceHash: hashNativeAuthSecret(nonce),
      redirectPath: sanitizeNativeRedirectPath(body.redirectTo),
      expiresAt: new Date(now.getTime() + NATIVE_AUTH_ATTEMPT_TTL_MS),
    },
    select: { id: true },
  });
  const externalAuthUrl = new URL("/api/native-auth/browser-start", getSiteUrl());
  externalAuthUrl.searchParams.set("attempt", attempt.id);
  externalAuthUrl.searchParams.set("nonce", nonce);
  externalAuthUrl.searchParams.set("intent", "login");
  logNativeAuth("bearer_attempt_created", { attemptId: attempt.id, platform: body.platform });
  return nativeCorsJson(request, { externalAuthUrl: externalAuthUrl.toString() });
}
