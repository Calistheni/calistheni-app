import "server-only";

import { prisma } from "@/lib/prisma";
import {
  createNativeAuthSecret,
  hashNativeAuthSecret,
  NATIVE_AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/native-auth-server";
import {
  isNativeSessionUsable,
  NATIVE_BEARER_PATTERN,
} from "@/lib/auth/native-session-core";

export { parseNativeBearerHeader } from "@/lib/auth/native-session-core";

export async function createNativeSession(
  userId: string,
  platform: "IOS" | "ANDROID",
  now = new Date()
) {
  const token = createNativeAuthSecret();
  const session = await prisma.nativeSession.create({
    data: {
      userId,
      platform,
      tokenHash: hashNativeAuthSecret(token),
      expiresAt: new Date(now.getTime() + NATIVE_AUTH_SESSION_MAX_AGE_SECONDS * 1000),
      lastUsedAt: now,
    },
    select: { id: true, userId: true, expiresAt: true },
  });
  return { token, session };
}

export async function resolveNativeSession(token: string, now = new Date()) {
  if (!NATIVE_BEARER_PATTERN.test(token)) return null;
  const session = await prisma.nativeSession.findUnique({
    where: { tokenHash: hashNativeAuthSecret(token) },
    select: { id: true, userId: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
  });
  if (!session || !isNativeSessionUsable(session, now)) return null;

  if (session.lastUsedAt.getTime() < now.getTime() - 5 * 60 * 1000) {
    await prisma.nativeSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastUsedAt: now },
    });
  }
  return session;
}

export async function revokeNativeSession(sessionId: string, now = new Date()) {
  return prisma.nativeSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}
