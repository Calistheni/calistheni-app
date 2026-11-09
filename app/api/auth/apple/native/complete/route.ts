import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  exchangeNativeAppleAuthorizationCode,
  verifyExchangedAppleIdentityToken,
  verifyNativeAppleIdentityToken,
} from "@/lib/auth/apple";
import {
  createDatabaseSession,
  getDatabaseSessionFromRequest,
  isRecentAuthentication,
  setDatabaseSessionCookie,
} from "@/lib/auth/database-session";
import { assertTrustedAuthOrigin, encryptAuthToken, hashAuthSecret } from "@/lib/auth/security";

export const runtime = "nodejs";
const nativeAppleClientId = process.env.IOS_BUNDLE_ID?.trim() || "com.petershikrenov.calistheni";

type NativeAppleBody = {
  state?: unknown;
  nonce?: unknown;
  identityToken?: unknown;
  authorizationCode?: unknown;
  givenName?: unknown;
  familyName?: unknown;
};

function safeName(givenName: unknown, familyName: unknown) {
  const parts = [givenName, familyName]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = parts.join(" ").slice(0, 120);
  return name || null;
}

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid Apple authentication request." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as NativeAppleBody | null;
  if (
    typeof body?.state !== "string" ||
    typeof body.nonce !== "string" ||
    typeof body.identityToken !== "string" ||
    typeof body.authorizationCode !== "string"
  ) {
    return NextResponse.json({ error: "Apple authentication did not complete." }, { status: 400 });
  }
  const now = new Date();
  const attempt = await prisma.appleAuthAttempt.findFirst({
    where: {
      stateHash: hashAuthSecret(body.state),
      nonceHash: hashAuthSecret(body.nonce),
      expiresAt: { gt: now },
      consumedAt: null,
    },
  });
  if (!attempt) return NextResponse.json({ error: "Apple authentication expired." }, { status: 400 });

  try {
    const [identity, exchanged] = await Promise.all([
      verifyNativeAppleIdentityToken(body.identityToken, body.nonce),
      exchangeNativeAppleAuthorizationCode(body.authorizationCode),
    ]);
    const exchangedSubject = await verifyExchangedAppleIdentityToken(exchanged.idToken, body.nonce);
    if (exchangedSubject !== identity.subject) throw new Error("APPLE_IDENTITY_MISMATCH");

    let linkSession = null;
    if (attempt.intent === "link") {
      linkSession = await getDatabaseSessionFromRequest(request);
      if (
        !linkSession ||
        linkSession.userId !== attempt.userId ||
        linkSession.sessionTokenHash !== attempt.sessionTokenHash ||
        !isRecentAuthentication(linkSession.authenticatedAt, now)
      ) {
        return NextResponse.json({ error: "RECENT_AUTH_REQUIRED" }, { status: 403 });
      }
    }

    const existingAccount = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: "apple", providerAccountId: identity.subject } },
      select: { userId: true },
    });
    const existingAuthorization = existingAccount
      ? await prisma.appleAuthorization.findUnique({
          where: { userId: existingAccount.userId },
          select: { revokedAt: true },
        })
      : null;
    if (attempt.intent === "link" && existingAccount && existingAccount.userId !== attempt.userId) {
      return NextResponse.json({ error: "APPLE_ACCOUNT_ALREADY_LINKED" }, { status: 409 });
    }
    if (!existingAccount && attempt.intent === "login" && identity.email) {
      const emailOwner = await prisma.user.findFirst({
        where: { email: { equals: identity.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (emailOwner) {
        return NextResponse.json({ error: "ACCOUNT_LINK_REQUIRED" }, { status: 409 });
      }
    }
    if ((!existingAccount || existingAuthorization?.revokedAt) && !exchanged.refreshToken) {
      return NextResponse.json({ error: "APPLE_AUTHORIZATION_INCOMPLETE" }, { status: 400 });
    }

    const encrypted = exchanged.refreshToken ? encryptAuthToken(exchanged.refreshToken) : null;
    const userId = await prisma.$transaction(
      async (tx) => {
        const targetUserId = existingAccount?.userId ?? attempt.userId;
        if (targetUserId) {
          const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "User"
            WHERE "id" = ${targetUserId} AND "deletedAt" IS NULL
            FOR UPDATE
          `;
          if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
        }
        const consumed = await tx.appleAuthAttempt.updateMany({
          where: { id: attempt.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new Error("APPLE_ATTEMPT_REPLAYED");

        if (existingAccount) {
          if (encrypted) {
            await tx.appleAuthorization.upsert({
              where: { userId: existingAccount.userId },
              create: {
                userId: existingAccount.userId,
                providerAccountId: identity.subject,
                clientId: nativeAppleClientId,
                refreshTokenCiphertext: encrypted.ciphertext,
                refreshTokenIv: encrypted.iv,
                refreshTokenTag: encrypted.tag,
                encryptionKeyId: encrypted.keyId,
              },
              update: {
                clientId: nativeAppleClientId,
                refreshTokenCiphertext: encrypted.ciphertext,
                refreshTokenIv: encrypted.iv,
                refreshTokenTag: encrypted.tag,
                encryptionKeyId: encrypted.keyId,
                revokedAt: null,
                revocationPendingAt: null,
              },
            });
          }
          return existingAccount.userId;
        }

        const linkedUserId = attempt.userId;
        const user = linkedUserId
          ? await tx.user.findUniqueOrThrow({ where: { id: linkedUserId } })
          : await tx.user.create({
              data: {
                email: identity.email,
                emailVerified: identity.emailVerified ? now : null,
                name: safeName(body.givenName, body.familyName),
              },
            });
        if (user.deletedAt) throw new Error("AUTH_USER_DEACTIVATED");
        await tx.account.create({
          data: {
            userId: user.id,
            type: "oidc",
            provider: "apple",
            providerAccountId: identity.subject,
          },
        });
        await tx.appleAuthorization.create({
          data: {
            userId: user.id,
            providerAccountId: identity.subject,
            clientId: nativeAppleClientId,
            refreshTokenCiphertext: encrypted!.ciphertext,
            refreshTokenIv: encrypted!.iv,
            refreshTokenTag: encrypted!.tag,
            encryptionKeyId: encrypted!.keyId,
          },
        });
        return user.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (attempt.intent === "link") return NextResponse.json({ ok: true, linked: true });
    const sessionToken = await createDatabaseSession(userId, now, "apple");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboardingCompleted: true } });
    const response = NextResponse.json({
      ok: true,
      redirectTo: user?.onboardingCompleted ? "/home" : "/onboarding",
    });
    setDatabaseSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    console.error("[auth.apple] native authentication rejected", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Apple authentication could not be verified." }, { status: 401 });
  }
}
