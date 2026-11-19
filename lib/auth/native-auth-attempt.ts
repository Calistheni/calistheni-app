import "server-only";

import { prisma } from "@/lib/prisma";
import type { NativeAuthIntent, NativeAuthPlatform } from "@/lib/generated/prisma/client";
import { NATIVE_AUTH_ATTEMPT_TTL_MS, sanitizeNativeRedirectPath } from "./native-auth";
import { createNativeAuthSecret, hashNativeAuthSecret } from "./native-auth-server";

export async function createNativeGoogleAttempt(input: {
  platform: NativeAuthPlatform;
  intent: NativeAuthIntent;
  verifierChallenge: string;
  redirectTo?: unknown;
  userId?: string;
  initiatingSessionHash?: string;
}) {
  const handoffCode = createNativeAuthSecret();
  const now = new Date();
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      WITH expired AS (
        SELECT "id" FROM "NativeAuthAttempt"
        WHERE "expiresAt" <= ${now}
        ORDER BY "expiresAt"
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "NativeAuthAttempt" USING expired
      WHERE "NativeAuthAttempt"."id" = expired."id"
    `;
    const { redirectTo, ...binding } = input;
    return tx.nativeAuthAttempt.create({
      data: {
        ...binding,
        nonceHash: hashNativeAuthSecret(createNativeAuthSecret()),
        handoffCodeHash: hashNativeAuthSecret(handoffCode),
        redirectPath: sanitizeNativeRedirectPath(redirectTo),
        expiresAt: new Date(now.getTime() + NATIVE_AUTH_ATTEMPT_TTL_MS),
      },
      select: { id: true },
    });
  });
  return { attemptId: attempt.id, handoffCode };
}
