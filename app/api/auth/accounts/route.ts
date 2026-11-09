import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getDatabaseSessionFromRequest, isRecentAuthentication } from "@/lib/auth/database-session";
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { revokeStoredAppleAuthorization } from "@/lib/auth/apple";

export const runtime = "nodejs";

async function status(request: Request) {
  const session = await getDatabaseSessionFromRequest(request);
  if (!session) return null;
  const [accounts, credential] = await Promise.all([
    prisma.account.findMany({ where: { userId: session.userId }, select: { provider: true } }),
    prisma.passwordCredential.findUnique({ where: { userId: session.userId }, select: { userId: true } }),
  ]);
  return {
    google: accounts.some((account) => account.provider === "google"),
    apple: accounts.some((account) => account.provider === "apple"),
    password: Boolean(credential),
    passwordVerified: Boolean(credential && session.user.emailVerified),
    recentAuthentication: isRecentAuthentication(session.authenticatedAt),
  };
}

export async function GET(request: Request) {
  const result = await status(request);
  return result ? NextResponse.json(result) : NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function DELETE(request: Request) {
  try { assertTrustedAuthOrigin(request); } catch {
    return NextResponse.json({ error: "Invalid unlink request." }, { status: 403 });
  }
  const session = await getDatabaseSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!isRecentAuthentication(session.authenticatedAt)) return NextResponse.json({ error: "RECENT_AUTH_REQUIRED" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { provider?: unknown } | null;
  if (body?.provider !== "google" && body?.provider !== "apple") return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  const provider = body.provider;
  const result = await prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${session.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return { state: "deleted" as const, retryAppleRevocation: false };
    // A transaction-scoped PostgreSQL advisory lock serializes every login-
    // method removal for this canonical user, including different providers.
    await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${session.userId}, 0))`;
    // Interactive transactions use one PostgreSQL connection. Keep its queries
    // sequential instead of issuing concurrent client.query calls, which
    // triggers the pg deprecation warning and will be unsupported by pg 9.
    const accounts = await tx.account.findMany({
      where: { userId: session.userId },
      select: { provider: true },
    });
    const credential = await tx.passwordCredential.findUnique({
      where: { userId: session.userId },
      select: { userId: true },
    });
    const user = await tx.user.findUnique({
      where: { id: session.userId },
      select: { emailVerified: true },
    });
    const appleAuthorization = provider === "apple"
      ? await tx.appleAuthorization.findUnique({
          where: { userId: session.userId },
          select: { revokedAt: true, revocationPendingAt: true },
        })
      : null;
    const connected = accounts.some((account) => account.provider === provider);
    if (!connected) {
      return {
        state: "missing" as const,
        retryAppleRevocation: provider === "apple" && Boolean(appleAuthorization && !appleAuthorization.revokedAt),
      };
    }
    const otherProvider = accounts.some((account) => account.provider !== provider);
    const usablePassword = Boolean(credential && user?.emailVerified);
    if (!otherProvider && !usablePassword) return { state: "final" as const, retryAppleRevocation: false };

    if (provider === "apple") {
      await tx.appleAuthorization.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revocationPendingAt: new Date() },
      });
    }
    await tx.account.deleteMany({ where: { userId: session.userId, provider } });
    return { state: "deleted" as const, retryAppleRevocation: provider === "apple" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if (result.state === "final") {
    return NextResponse.json({ error: "FINAL_LOGIN_METHOD" }, { status: 409 });
  }
  if (result.retryAppleRevocation) {
    try {
      await revokeStoredAppleAuthorization(session.userId);
    } catch {
      // The provider is disconnected locally. Keep the encrypted token and
      // pending marker so a later idempotent request/worker can retry revocation.
      return NextResponse.json({ ok: true, revocationPending: true }, { status: 202 });
    }
  }
  if (result.state === "missing") {
    return NextResponse.json({ error: "Account is not connected." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, revocationPending: false });
}
