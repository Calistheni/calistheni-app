import { prisma } from "@/lib/prisma";
import { isNativeAuthCode, sanitizeNativeRedirectPath } from "@/lib/auth/native-auth";
import {
  createNativeAuthSecret,
  hashNativeAuthSecret,
  logNativeAuth,
  NATIVE_AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/native-auth-server";
import { nativeCorsJson, nativeCorsPreflight, rejectDisallowedNativeOrigin } from "@/lib/native-api-cors";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function POST(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  let body: { code?: unknown };
  try { body = await request.json(); } catch {
    return nativeCorsJson(request, { error: "Invalid authentication handoff.", code: "NATIVE_AUTH_EXCHANGE_INVALID" }, { status: 400 });
  }
  if (!isNativeAuthCode(body.code)) {
    return nativeCorsJson(request, { error: "Invalid authentication handoff.", code: "NATIVE_AUTH_EXCHANGE_INVALID" }, { status: 400 });
  }

  const now = new Date();
  const rawToken = createNativeAuthSecret();
  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.nativeAuthAttempt.findFirst({
      where: {
        handoffCodeHash: hashNativeAuthSecret(body.code as string),
        consumedAt: null,
        expiresAt: { gt: now },
        userId: { not: null },
      },
      select: { id: true, userId: true, platform: true, redirectPath: true },
    });
    if (!attempt?.userId) return null;
    const consumed = await tx.nativeAuthAttempt.updateMany({
      where: { id: attempt.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;
    const session = await tx.nativeSession.create({
      data: {
        userId: attempt.userId,
        platform: attempt.platform,
        tokenHash: hashNativeAuthSecret(rawToken),
        expiresAt: new Date(now.getTime() + NATIVE_AUTH_SESSION_MAX_AGE_SECONDS * 1000),
        lastUsedAt: now,
      },
      select: { expiresAt: true },
    });
    return { ...attempt, expiresAt: session.expiresAt };
  });

  if (!result) {
    return nativeCorsJson(request, { error: "This sign-in link is invalid or expired.", code: "NATIVE_AUTH_EXCHANGE_REJECTED" }, { status: 401 });
  }
  logNativeAuth("bearer_exchange_succeeded", { attemptId: result.id, userId: result.userId });
  return nativeCorsJson(request, {
    token: rawToken,
    tokenType: "Bearer",
    expiresAt: result.expiresAt.toISOString(),
    redirectTo: sanitizeNativeRedirectPath(result.redirectPath),
  }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
