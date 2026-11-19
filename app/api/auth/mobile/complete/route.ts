import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isNativeAuthAttemptId,
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
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { getDatabaseSessionFromRequest, isRecentAuthentication } from "@/lib/auth/database-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SENSITIVE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function failedCompletion(status: number) {
  return NextResponse.json({ error: "Unable to finish Google sign-in." }, { status, headers: SENSITIVE_HEADERS });
}

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return failedCompletion(403);
  }
  const body = await request.json().catch(() => null);
  const { attempt, code, verifier } = body ?? {};
  if (!isNativeAuthAttemptId(attempt) || !isNativeAuthCode(code) || !isNativeAuthCode(verifier)) {
    return failedCompletion(400);
  }

  const now = new Date();
  const sessionToken = createNativeAuthSecret();
  const initiatingSession = await getDatabaseSessionFromRequest(request);
  const handoff = await prisma.$transaction(async (tx) => {
    const candidate = await tx.nativeAuthAttempt.findFirst({
      where: {
        id: attempt,
        intent: { in: ["LOGIN", "LINK", "REAUTH"] },
        handoffIssuedAt: { not: null },
        verifierChallenge: hashNativeAuthSecret(verifier),
        handoffCodeHash: hashNativeAuthSecret(code),
        expiresAt: { gt: now },
        consumedAt: null,
        userId: { not: null },
      },
      select: { id: true, userId: true, redirectPath: true, intent: true, initiatingSessionHash: true },
    });
    if (!candidate?.userId) return null;

    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${candidate.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return null;

    if (candidate.intent !== "LOGIN") {
      if (!initiatingSession || initiatingSession.userId !== candidate.userId ||
          initiatingSession.sessionTokenHash !== candidate.initiatingSessionHash) return null;
    }

    let pendingLink: Prisma.AccountUncheckedCreateInput | undefined;
    if (candidate.intent === "LINK" && initiatingSession) {
      const [currentSession] = await tx.$queryRaw<Array<{ authenticatedAt: Date | null }>>`
        SELECT "authenticatedAt" FROM "Session"
        WHERE "sessionToken" = ${initiatingSession.sessionToken} AND "userId" = ${candidate.userId}
          AND "purpose" = 'APPLICATION' AND "expires" > ${now}
        FOR UPDATE
      `;
      if (!currentSession || !isRecentAuthentication(currentSession.authenticatedAt, now)) return null;
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
        pendingLink = {
          userId: candidate.userId,
          provider: "google",
          providerAccountId: intent.pendingProviderAccountId,
          type: intent.pendingAccountType,
          expires_at: intent.pendingExpiresAt,
          scope: intent.pendingScope,
        };
      }
    }

    const consumed = await tx.nativeAuthAttempt.updateMany({
      where: { id: candidate.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;
    if (pendingLink) await tx.account.create({ data: pendingLink });

    if (candidate.intent === "REAUTH") {
      const refreshed = await tx.session.updateMany({
        where: {
          userId: candidate.userId,
          sessionToken: initiatingSession!.sessionToken,
          expires: { gt: now },
          purpose: "APPLICATION",
        },
        data: { authenticatedAt: now },
      });
      if (refreshed.count !== 1) throw new Error("Initiating session is no longer active.");
    }

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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }).catch(() => null);

  if (!handoff) return failedCompletion(401);

  const response = NextResponse.json({ redirectTo: sanitizeNativeRedirectPath(handoff.redirectPath) }, { headers: SENSITIVE_HEADERS });
  if (handoff.intent === "LOGIN") {
    response.cookies.set(
      getAuthSessionCookieName(),
      sessionToken,
      getNativeAuthCookieOptions(NATIVE_AUTH_SESSION_MAX_AGE_SECONDS)
    );
  }
  logNativeAuth("completion_succeeded", { intent: handoff.intent });
  return response;
}
