import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  NATIVE_AUTH_COMPLETION_PATH,
  isNativeAuthCode,
  sanitizeNativeRedirectPath,
} from "@/lib/auth/native-auth";
import {
  createNativeAuthSecret,
  getAuthSessionCookieName,
  getNativeAuthCookieOptions,
  hashNativeAuthSecret,
  logNativeAuth,
  NATIVE_AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";
import { getDatabaseSessionFromRequest, isRecentAuthentication } from "@/lib/auth/database-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SENSITIVE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function failedCompletion(reason: "expired" | "invalid") {
  const url = new URL("/login", getSiteUrl());
  url.searchParams.set("nativeAuthError", reason);
  return NextResponse.redirect(url, { headers: SENSITIVE_HEADERS });
}

/**
 * Consumes the opaque browser handoff in the WKWebView.  The transaction's
 * conditional update is the state transition: concurrent requests cannot both
 * create an Auth.js database session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!isNativeAuthCode(code)) return failedCompletion("invalid");

  const now = new Date();
  const sessionToken = createNativeAuthSecret();
  const initiatingSession = await getDatabaseSessionFromRequest(request);
  const handoff = await prisma.$transaction(async (tx) => {
    // Opportunistic bounded cleanup; it is never needed for correctness.
    await tx.nativeAuthAttempt.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
    });

    const candidate = await tx.nativeAuthAttempt.findFirst({
      where: {
        handoffCodeHash: hashNativeAuthSecret(code),
        expiresAt: { gt: now },
        consumedAt: null,
        userId: { not: null },
      },
      select: { id: true, userId: true, redirectPath: true, intent: true },
    });
    if (!candidate?.userId) return null;

    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${candidate.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return null;

    if (candidate.intent === "LINK") {
      if (
        !initiatingSession ||
        initiatingSession.userId !== candidate.userId ||
        !isRecentAuthentication(initiatingSession.authenticatedAt, now)
      ) {
        return null;
      }
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${candidate.userId}, 0))`;
      const intent = await tx.authLinkIntent.findUnique({
        where: { nativeAuthAttemptId: candidate.id },
      });
      if (
        !intent ||
        intent.userId !== candidate.userId ||
        intent.provider !== "google" ||
        !intent.consumedAt ||
        intent.expiresAt <= now ||
        !intent.pendingProviderAccountId ||
        !intent.pendingAccountType
      ) {
        return null;
      }
      const providerOwner = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: intent.pendingProviderAccountId,
          },
        },
        select: { userId: true },
      });
      if (providerOwner && providerOwner.userId !== candidate.userId) return null;
      const currentGoogle = await tx.account.findFirst({
        where: { userId: candidate.userId, provider: "google" },
        select: { providerAccountId: true },
      });
      if (currentGoogle && currentGoogle.providerAccountId !== intent.pendingProviderAccountId) return null;
      if (!providerOwner) {
        await tx.account.create({
          data: {
            userId: candidate.userId,
            provider: "google",
            providerAccountId: intent.pendingProviderAccountId,
            type: intent.pendingAccountType,
            expires_at: intent.pendingExpiresAt,
            scope: intent.pendingScope,
          },
        });
      }
    }

    const consumed = await tx.nativeAuthAttempt.updateMany({
      where: { id: candidate.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;

    if (candidate.intent === "LOGIN") {
      await tx.session.create({
        data: {
          sessionToken,
          userId: candidate.userId,
          authenticatedAt: now,
          purpose: "APPLICATION",
          authProvider: "google",
          expires: new Date(now.getTime() + NATIVE_AUTH_SESSION_MAX_AGE_SECONDS * 1000),
        },
      });
    }
    return candidate;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if (!handoff) {
    logNativeAuth("completion_rejected", { completionPath: NATIVE_AUTH_COMPLETION_PATH });
    return failedCompletion("expired");
  }

  const response = NextResponse.redirect(
    new URL(sanitizeNativeRedirectPath(handoff.redirectPath), getSiteUrl()),
    { headers: SENSITIVE_HEADERS }
  );
  if (handoff.intent === "LOGIN") {
    response.cookies.set(
      getAuthSessionCookieName(),
      sessionToken,
      getNativeAuthCookieOptions(NATIVE_AUTH_SESSION_MAX_AGE_SECONDS)
    );
  }
  logNativeAuth("completion_succeeded", { attemptId: handoff.id, userId: handoff.userId });
  return response;
}
