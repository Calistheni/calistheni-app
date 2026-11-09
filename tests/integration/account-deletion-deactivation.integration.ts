import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test(
  "account deletion requires recent same-session confirmation and deactivates atomically",
  { skip: !safeLocalDatabase },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ACCOUNT_DELETION_REQUESTS_ENABLED = "true";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.AUTH_SECRET ??= "local-account-deletion-integration-test-secret";
    process.env.AUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    process.env.APPLE_TEAM_ID = "TESTTEAMID";
    process.env.APPLE_AUTH_KEY_ID = "TESTKEYID";
    process.env.AUTH_APPLE_ID = "com.example.test";
    const testAppleKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    process.env.APPLE_AUTH_PRIVATE_KEY = testAppleKey.export({ format: "pem", type: "pkcs8" }).toString();
    const originalFetch = globalThis.fetch;

    const [
      { prisma },
      deletionRoute,
      { getAuthSessionCookieName },
      { hashAuthSecret },
      { hashNativeAuthSecret },
      { hashPassword },
      { encryptAuthToken },
      { getUserEntitlements },
      { deactivateAccountForDeletion },
      { POST: exchangeNativeHandoff },
      passwordLoginRoute,
      passwordResetRoute,
    ] = await Promise.all([
      import("../../lib/prisma.ts"),
      import("../../app/api/account/deletion/request/route.ts"),
      import("../../lib/auth/native-auth-server.ts"),
      import("../../lib/auth/security.ts"),
      import("../../lib/auth/native-auth-server.ts"),
      import("../../lib/auth/password-core.ts"),
      import("../../lib/auth/security.ts"),
      import("../../lib/entitlements.ts"),
      import("../../lib/account-deletion.ts"),
      import("../../app/api/native-auth/exchange/route.ts"),
      import("../../app/api/auth/password/login/route.ts"),
      import("../../app/api/auth/password/reset/route.ts"),
    ]);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `deletion-${suffix}@example.test`,
        emailVerified: new Date(),
        passwordCredential: {
          create: {
            emailNormalized: `deletion-${suffix}@example.test`,
            passwordHash: await hashPassword("correct horse battery staple"),
          },
        },
      },
    });
    const otherUser = await prisma.user.create({
      data: { email: `deletion-other-${suffix}@example.test` },
    });
    const sessionToken = `deletion-session-${suffix}`;
    const staleSessionToken = `deletion-stale-session-${suffix}`;
    const nativeToken = `deletion-native-${suffix}`;
    const now = new Date();
    const validUntil = new Date(now.getTime() + 60 * 60 * 1000);
    const passwordResetToken = `reset-${suffix}`;
    const passwordResetTokenHash = hashAuthSecret(passwordResetToken);

    try {
      globalThis.fetch = async () => new Response(null, { status: 200 });
      await prisma.session.createMany({
        data: [
          {
            sessionToken,
            userId: user.id,
            expires: validUntil,
            authenticatedAt: now,
            purpose: "APPLICATION",
            authProvider: "password",
          },
          {
            sessionToken: staleSessionToken,
            userId: user.id,
            expires: validUntil,
            authenticatedAt: new Date(now.getTime() - 11 * 60 * 1000),
            purpose: "APPLICATION",
            authProvider: "google",
          },
        ],
      });
      await prisma.nativeSession.create({
        data: {
          userId: user.id,
          tokenHash: hashNativeAuthSecret(nativeToken),
          platform: "IOS",
          expiresAt: validUntil,
          lastUsedAt: now,
        },
      });
      await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: `cus_deletion_${suffix}`,
          stripeSubscriptionId: `sub_deletion_${suffix}`,
          plan: "PRO_MONTHLY",
          status: "ACTIVE",
        },
      });
      const encryptedAppleToken = encryptAuthToken("test-apple-refresh-token");
      await prisma.appleAuthorization.create({
        data: {
          userId: user.id,
          providerAccountId: `apple-deletion-${suffix}`,
          clientId: "com.example.test",
          refreshTokenCiphertext: encryptedAppleToken.ciphertext,
          refreshTokenIv: encryptedAppleToken.iv,
          refreshTokenTag: encryptedAppleToken.tag,
          encryptionKeyId: encryptedAppleToken.keyId,
        },
      });
      await prisma.authActionToken.create({
        data: {
          userId: user.id,
          purpose: "PASSWORD_RESET",
          tokenHash: passwordResetTokenHash,
          emailNormalized: user.email!,
          expiresAt: validUntil,
        },
      });
      await prisma.authLinkIntent.create({
        data: {
          userId: user.id,
          provider: "google",
          secretHash: hashAuthSecret(`link-${suffix}`),
          sessionTokenHash: hashAuthSecret(sessionToken),
          expiresAt: validUntil,
        },
      });
      await prisma.appleAuthAttempt.create({
        data: {
          userId: user.id,
          intent: "login",
          stateHash: hashAuthSecret(`apple-state-${suffix}`),
          nonceHash: hashAuthSecret(`apple-nonce-${suffix}`),
          expiresAt: validUntil,
        },
      });
      await prisma.nativeAuthAttempt.create({
        data: {
          platform: "IOS",
          userId: user.id,
          nonceHash: hashNativeAuthSecret(`native-nonce-${suffix}`),
          expiresAt: validUntil,
        },
      });

      const cookieName = getAuthSessionCookieName();
      const post = (token?: string, origin = "http://localhost:3000", body: unknown = { confirmation: "DELETE_MY_ACCOUNT" }) =>
        deletionRoute.POST(
          new Request("http://localhost:3000/api/account/deletion/request", {
            method: "POST",
            headers: {
              ...(origin ? { origin } : {}),
              ...(token ? { cookie: `${cookieName}=${token}` } : {}),
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          })
        );

      assert.equal((await post()).status, 401, "unauthenticated requests are rejected");
      assert.equal((await post(sessionToken, "")).status, 403, "missing Origin is rejected");
      assert.equal((await post(staleSessionToken)).status, 403, "stale authentication is rejected");
      assert.equal((await post(sessionToken, "http://localhost:3000", {})).status, 400, "explicit confirmation is required");

      const response = await post(sessionToken, "http://localhost:3000", {
        confirmation: "DELETE_MY_ACCOUNT",
        userId: otherUser.id,
      });
      assert.equal(response.status, 202);
      assert.equal(response.headers.get("cache-control"), "no-store");

      const [deletedUser, deletion, stripe, remainingWebSessions, revokedNative, resetToken, revokedApple] = await Promise.all([
        prisma.user.findUnique({ where: { id: user.id }, select: { deletedAt: true } }),
        prisma.accountDeletion.findUnique({ where: { userId: user.id } }),
        prisma.subscription.findUnique({ where: { userId: user.id } }),
        prisma.session.count({ where: { userId: user.id } }),
        prisma.nativeSession.findFirst({ where: { userId: user.id } }),
        prisma.authActionToken.findUnique({ where: { tokenHash: passwordResetTokenHash } }),
        prisma.appleAuthorization.findUnique({ where: { userId: user.id } }),
      ]);
      assert.ok(deletedUser?.deletedAt);
      assert.equal(deletion?.status, "DEACTIVATED");
      assert.equal(deletion?.requestedAt.getTime(), deletion?.deactivatedAt?.getTime());
      assert.equal(deletion?.cleanupDeadline.getTime(), deletion!.requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      assert.equal(remainingWebSessions, 0);
      assert.ok(revokedNative?.revokedAt);
      assert.equal(resetToken, null, "deactivation removes outstanding reset capabilities immediately");
      assert.ok(revokedApple?.revokedAt);
      assert.equal(revokedApple?.revocationPendingAt, null);
      assert.equal(deletion?.appleRevocationStatus, "COMPLETED");
      assert.equal(deletion?.appleRevocationAttemptCount, 1);
      assert.equal(stripe?.status, "ACTIVE", "deletion must not modify Stripe billing");
      assert.equal(stripe?.stripeSubscriptionId, `sub_deletion_${suffix}`);
      assert.equal(await prisma.authLinkIntent.count({ where: { userId: user.id } }), 0);
      assert.equal(await prisma.appleAuthAttempt.count({ where: { userId: user.id } }), 0);
      assert.equal(await prisma.nativeAuthAttempt.count({ where: { userId: user.id } }), 0);
      assert.equal(await getUserEntitlements(user.id).then((value) => value.entitlements.isPro), false);
      assert.equal(await deactivateAccountForDeletion(user.id).then((value) => value.state), "ALREADY_DEACTIVATED");

      const deletedPasswordLogin = await passwordLoginRoute.POST(
        new Request("http://localhost:3000/api/auth/password/login", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ email: user.email, password: "correct horse battery staple" }),
        })
      );
      assert.equal(deletedPasswordLogin.status, 401);
      const deletedPasswordReset = await passwordResetRoute.POST(
        new Request("http://localhost:3000/api/auth/password/reset", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ token: passwordResetToken, password: "another correct horse battery staple", confirmPassword: "another correct horse battery staple" }),
        })
      );
      assert.equal(deletedPasswordReset.status, 400);

      const staleNativeAttempt = await prisma.nativeAuthAttempt.create({
        data: {
          platform: "IOS",
          userId: user.id,
          nonceHash: hashNativeAuthSecret(`late-native-nonce-${suffix}`),
          handoffCodeHash: hashNativeAuthSecret(`late-native-code-${suffix}`),
          expiresAt: validUntil,
        },
      });
      const handoff = await exchangeNativeHandoff(
        new Request("http://localhost:3000/api/native-auth/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attempt: staleNativeAttempt.id, code: `late-native-code-${suffix}` }),
        })
      );
      assert.equal(handoff.status, 401, "a delayed native handoff cannot restore access");
      assert.equal((await prisma.user.findUnique({ where: { id: otherUser.id }, select: { deletedAt: true } }))?.deletedAt, null,
        "client-supplied user IDs cannot select another account");
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.accountDeletion.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });
      await prisma.$disconnect();
    }
  }
);

test(
  "concurrent deletion requests create one durable deactivation record",
  { skip: !safeLocalDatabase },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { deactivateAccountForDeletion }] = await Promise.all([
      import("../../lib/prisma.ts"),
      import("../../lib/account-deletion.ts"),
    ]);
    const user = await prisma.user.create({ data: {} });
    try {
      const results = await Promise.all([
        deactivateAccountForDeletion(user.id),
        deactivateAccountForDeletion(user.id),
      ]);
      assert.deepEqual(
        results.map((result) => result.state).sort(),
        ["ALREADY_DEACTIVATED", "DEACTIVATED"]
      );
      assert.equal(await prisma.accountDeletion.count({ where: { userId: user.id } }), 1);
      assert.ok((await prisma.user.findUnique({ where: { id: user.id }, select: { deletedAt: true } }))?.deletedAt);
    } finally {
      await prisma.accountDeletion.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  }
);
