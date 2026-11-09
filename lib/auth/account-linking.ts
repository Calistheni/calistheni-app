import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getDatabaseSessionFromRequest,
  isRecentAuthentication,
} from "@/lib/auth/database-session";
import { createAuthSecret, hashAuthSecret } from "@/lib/auth/security";
import { getAuthSessionCookieName } from "@/lib/auth/native-auth-server";
import type { AdapterAccount } from "next-auth/adapters";

export const AUTH_LINK_COOKIE = "calistheni.auth-link";
const LINK_TTL_MS = 10 * 60 * 1000;

export function isLinkableProvider(provider: unknown): provider is "google" | "apple" {
  return provider === "google" || provider === "apple";
}

export async function createOAuthLinkIntent(request: Request, provider: "google" | "apple") {
  const session = await getDatabaseSessionFromRequest(request);
  if (!session) return { error: "UNAUTHORIZED" as const };
  if (!isRecentAuthentication(session.authenticatedAt)) {
    return { error: "RECENT_AUTH_REQUIRED" as const };
  }
  const existing = await prisma.account.findFirst({
    where: { userId: session.userId, provider },
    select: { providerAccountId: true },
  });
  if (existing) return { error: "ALREADY_CONNECTED" as const };

  const secret = createAuthSecret();
  await prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${session.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
    await tx.authLinkIntent.create({
      data: {
        userId: session.userId,
        provider,
        secretHash: hashAuthSecret(secret),
        sessionTokenHash: session.sessionTokenHash,
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
      },
    });
  });
  return { secret };
}

export async function consumeOAuthLinkIntent(provider: string, userId: string) {
  const cookieStore = await cookies();
  const secret = cookieStore.get(AUTH_LINK_COOKIE)?.value;
  if (!secret) return false;
  const now = new Date();
  const sessionToken = cookieStore.get(getAuthSessionCookieName())?.value;
  if (!sessionToken) return false;
  return prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return false;
    const intent = await tx.authLinkIntent.findFirst({
      where: {
        secretHash: hashAuthSecret(secret),
        provider,
        userId,
        sessionTokenHash: hashAuthSecret(sessionToken),
        expiresAt: { gt: now },
        consumedAt: null,
      },
    });
    if (!intent) return false;
    const consumed = await tx.authLinkIntent.updateMany({
      where: { id: intent.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return consumed.count === 1;
  });
}

/**
 * A native external browser may prove control of Google, but it must not be
 * allowed to attach that identity by possession of the handoff URL alone.
 * Stage the verified provider subject; the initiating WKWebView session makes
 * the Account row later when it consumes the native handoff.
 */
export async function stageNativeOAuthLink(account: AdapterAccount) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(getAuthSessionCookieName())?.value;
  if (!sessionToken) return false;
  const restrictedSession = await prisma.session.findFirst({
    where: {
      sessionToken,
      purpose: "OAUTH_LINK",
      expires: { gt: new Date() },
    },
    select: { userId: true },
  });
  if (!restrictedSession) return false;

  const secret = cookieStore.get(AUTH_LINK_COOKIE)?.value;
  if (!secret) throw new Error("NATIVE_OAUTH_LINK_CONTEXT_MISSING");
  const staged = await prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${restrictedSession.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return 0;
    const result = await tx.authLinkIntent.updateMany({
      where: {
        userId: restrictedSession.userId,
        provider: account.provider,
        secretHash: hashAuthSecret(secret),
        sessionTokenHash: hashAuthSecret(sessionToken),
        consumedAt: { not: null },
        expiresAt: { gt: new Date() },
        pendingProviderAccountId: null,
      },
      data: {
        pendingProviderAccountId: account.providerAccountId,
        pendingAccountType: account.type,
        pendingExpiresAt: account.expires_at,
        pendingScope: account.scope,
      },
    });
    return result.count;
  });
  if (staged !== 1) throw new Error("NATIVE_OAUTH_LINK_CONTEXT_INVALID");
  return true;
}
