import assert from "node:assert/strict";
import test from "node:test";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test("database-backed auth remediation invariants", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.AUTH_SECRET ??= "local-integration-test-secret-local-integration-test-secret";
  process.env.AUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64url");

  const [{ prisma }, accountsRoute, { getAuthSessionCookieName }, { applyVerifiedAppleAccountEvent }, { createAuthActionToken }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../app/api/auth/accounts/route.ts"),
    import("../../lib/auth/native-auth-server.ts"),
    import("../../lib/auth/apple-account-events.ts"),
    import("../../lib/auth/action-tokens.ts"),
  ]);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `auth-remediation-${suffix}@example.test`, emailVerified: new Date() } });
  try {
    await prisma.account.createMany({
      data: [
        { userId: user.id, provider: "google", providerAccountId: `google-${suffix}`, type: "oauth" },
        { userId: user.id, provider: "apple", providerAccountId: `apple-${suffix}`, type: "oidc" },
      ],
    });
    const applicationToken = `application-${suffix}`;
    const restrictedToken = `restricted-${suffix}`;
    await prisma.session.createMany({
      data: [
        { sessionToken: applicationToken, userId: user.id, expires: new Date(Date.now() + 60_000), authenticatedAt: new Date(), purpose: "APPLICATION", authProvider: "google" },
        { sessionToken: restrictedToken, userId: user.id, expires: new Date(Date.now() + 60_000), purpose: "OAUTH_LINK" },
      ],
    });
    const cookieName = getAuthSessionCookieName();
    const restrictedStatus = await accountsRoute.GET(new Request("http://localhost:3000/api/auth/accounts", {
      headers: { cookie: `${cookieName}=${restrictedToken}` },
    }));
    assert.equal(restrictedStatus.status, 401, "a link-only cookie must not authenticate an application route");

    const unlink = (provider: "google" | "apple") => accountsRoute.DELETE(new Request("http://localhost:3000/api/auth/accounts", {
      method: "DELETE",
      headers: {
        origin: "http://localhost:3000",
        cookie: `${cookieName}=${applicationToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ provider }),
    }));
    const responses = await Promise.all([unlink("google"), unlink("apple")]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(await prisma.account.count({ where: { userId: user.id } }), 1, "one verified provider must remain");

    const queued = await createAuthActionToken({
      userId: user.id,
      emailNormalized: user.email!,
      purpose: "PASSWORD_RESET",
    });
    const delivery = await prisma.authEmailDelivery.findUnique({ where: { id: queued.deliveryId } });
    assert.ok(delivery, "email delivery must be durable before the response is returned");
    assert.notEqual(delivery.tokenCiphertext, queued.token, "the outbox must not store a plaintext action token");

    const appleAccount = await prisma.account.upsert({
      where: { provider_providerAccountId: { provider: "apple", providerAccountId: `apple-event-${suffix}` } },
      create: { userId: user.id, provider: "apple", providerAccountId: `apple-event-${suffix}`, type: "oidc" },
      update: {},
    });
    assert.equal(appleAccount.userId, user.id);
    await prisma.session.createMany({
      data: [
        { sessionToken: `apple-session-${suffix}`, userId: user.id, expires: new Date(Date.now() + 60_000), authProvider: "apple" },
        { sessionToken: `google-session-${suffix}`, userId: user.id, expires: new Date(Date.now() + 60_000), authProvider: "google" },
      ],
    });
    await applyVerifiedAppleAccountEvent({
      jti: `event-${suffix}`,
      type: "consent-revoked",
      providerAccountId: appleAccount.providerAccountId,
      email: null,
      privateRelay: null,
      eventTime: new Date(),
    });
    assert.equal(await prisma.session.count({ where: { sessionToken: `apple-session-${suffix}` } }), 0);
    assert.equal(await prisma.session.count({ where: { sessionToken: `google-session-${suffix}` } }), 1);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
