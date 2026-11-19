import { prisma } from "@/lib/prisma";
import { isNativeAuthAttemptId, isNativeAuthCode, sanitizeNativeRedirectPath } from "@/lib/auth/native-auth";
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
  const { attempt, code, verifier } = (await request.json().catch(() => null)) ?? {};
  if (!isNativeAuthAttemptId(attempt) || !isNativeAuthCode(code) || !isNativeAuthCode(verifier)) {
    return nativeCorsJson(request, { error: "Invalid authentication handoff.", code: "NATIVE_AUTH_EXCHANGE_INVALID" }, { status: 400 });
  }

  const now = new Date();
  const rawToken = createNativeAuthSecret();
  const result = await prisma.$transaction(async (tx) => {
    const candidate = await tx.nativeAuthAttempt.findFirst({
      where: {
        id: attempt,
        intent: "BEARER_LOGIN",
        handoffCodeHash: hashNativeAuthSecret(code),
        verifierChallenge: hashNativeAuthSecret(verifier),
        handoffIssuedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: now },
        userId: { not: null },
      },
      select: { id: true, userId: true, platform: true, redirectPath: true },
    });
    if (!candidate?.userId) return null;
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${candidate.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return null;
    const consumed = await tx.nativeAuthAttempt.updateMany({
      where: { id: candidate.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;
    const session = await tx.nativeSession.create({
      data: {
        userId: candidate.userId,
        platform: candidate.platform,
        tokenHash: hashNativeAuthSecret(rawToken),
        expiresAt: new Date(now.getTime() + NATIVE_AUTH_SESSION_MAX_AGE_SECONDS * 1000),
        lastUsedAt: now,
      },
      select: { expiresAt: true },
    });
    return { redirectPath: candidate.redirectPath, expiresAt: session.expiresAt };
  });

  if (!result) {
    return nativeCorsJson(request, { error: "This sign-in link is invalid or expired.", code: "NATIVE_AUTH_EXCHANGE_REJECTED" }, { status: 401 });
  }
  logNativeAuth("bearer_exchange_succeeded", {});
  return nativeCorsJson(request, {
    token: rawToken,
    tokenType: "Bearer",
    expiresAt: result.expiresAt.toISOString(),
    redirectTo: sanitizeNativeRedirectPath(result.redirectPath),
  }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
