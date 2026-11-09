import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test("deleted email and provider identities can create a clean new account before cleanup", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "local-account-reregistration-integration-secret";
  process.env.AUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString("base64url");

  const [
    { prisma },
    { Prisma },
    { deactivateAccountForDeletion },
    { createPasswordAccount },
    { hashPassword },
    { hashAuthSecret, encryptAuthToken },
    { getDatabaseSessionFromRequest },
    { getUserEntitlements },
    { appleOwnershipRepository },
    { AppleTransactionOwnershipError, synchronizeOwnedAppleTransaction },
    { processAccountDeletionBatch },
    { applyVerifiedAppleAccountEvent },
    verifyEmailRoute,
    passwordLoginRoute,
  ] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/generated/prisma/client.ts"),
    import("../../lib/account-deletion.ts"),
    import("../../lib/auth/password-registration.ts"),
    import("../../lib/auth/password-core.ts"),
    import("../../lib/auth/security.ts"),
    import("../../lib/auth/database-session.ts"),
    import("../../lib/entitlements.ts"),
    import("../../lib/apple-iap/persistence.ts"),
    import("../../lib/apple-iap/ownership.ts"),
    import("../../lib/account-deletion-worker.ts"),
    import("../../lib/auth/apple-account-events.ts"),
    import("../../app/api/auth/password/verify-email/route.ts"),
    import("../../app/api/auth/password/login/route.ts"),
  ]);

  const suffix = `${Date.now()}-${randomUUID()}`;
  const email = `re-register-${suffix}@example.test`;
  const googleSubject = `google-sub-${suffix}`;
  const appleSubject = `apple-sub-${suffix}`;
  const appAccountToken = randomUUID();
  const now = new Date();
  const a = await prisma.user.create({
    data: {
      email,
      emailVerified: now,
      name: "Deleted Profile",
      username: `deleted-${suffix}`,
      passwordCredential: {
        create: { emailNormalized: email, passwordHash: await hashPassword("old-account-password-123") },
      },
    },
  });
  let bId: string | null = null;
  let deletionId: string | null = null;

  try {
    await prisma.account.createMany({
      data: [
        { userId: a.id, provider: "google", providerAccountId: googleSubject, type: "oauth" },
        { userId: a.id, provider: "apple", providerAccountId: appleSubject, type: "oidc" },
      ],
    });
    const encrypted = encryptAuthToken("synthetic-apple-refresh-token");
    await prisma.appleAuthorization.create({
      data: {
        userId: a.id,
        providerAccountId: appleSubject,
        clientId: "com.example.integration",
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenTag: encrypted.tag,
        encryptionKeyId: encrypted.keyId,
      },
    });
    await prisma.session.create({
      data: { userId: a.id, sessionToken: `old-session-${suffix}`, expires: new Date(now.getTime() + 60_000), authenticatedAt: now },
    });
    await prisma.verificationToken.create({
      data: { identifier: email, token: `old-magic-link-${suffix}`, expires: new Date(now.getTime() + 60_000) },
    });
    const oldResetToken = `old-reset-${suffix}`;
    const oldResetTokenHash = hashAuthSecret(oldResetToken);
    await prisma.authActionToken.create({
      data: {
        userId: a.id,
        purpose: "PASSWORD_RESET",
        tokenHash: oldResetTokenHash,
        emailNormalized: email,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    const oldWorkout = await prisma.workout.create({ data: { userId: a.id, title: "Private old workout", visibility: "PRIVATE" } });
    const subscription = await prisma.subscription.create({
      data: {
        userId: a.id,
        stripeCustomerId: `cus_reregister_${suffix}`,
        stripeSubscriptionId: `sub_reregister_${suffix}`,
        plan: "PRO_MONTHLY",
        status: "ACTIVE",
      },
    });
    const lifetimePurchase = await prisma.applePurchase.create({
      data: {
        userId: a.id,
        environment: "PRODUCTION",
        originalTransactionId: `original-${suffix}`,
        latestTransactionId: `transaction-${suffix}`,
        productId: "com.example.lifetime",
        productKind: "LIFETIME",
        state: "ACTIVE",
        purchasedAt: now,
        latestSignedDate: now,
        lastVerifiedAt: now,
      },
    });
    await prisma.appleBillingAccount.create({ data: { userId: a.id, appAccountToken } });
    await prisma.appleAccountEvent.create({
      data: { jti: `old-apple-event-${suffix}`, type: "email-enabled", providerAccountId: appleSubject, email, privateRelay: false, eventTime: now },
    });

    assert.equal((await deactivateAccountForDeletion(a.id, now)).state, "DEACTIVATED");
    const [tombstone, oldCredential, oldSession, oldAction, oldMagicLink, remainingAccounts] = await Promise.all([
      prisma.user.findUnique({ where: { id: a.id } }),
      prisma.passwordCredential.findUnique({ where: { emailNormalized: email } }),
      prisma.session.findUnique({ where: { sessionToken: `old-session-${suffix}` } }),
      prisma.authActionToken.findUnique({ where: { tokenHash: oldResetTokenHash } }),
      prisma.verificationToken.findUnique({ where: { identifier_token: { identifier: email, token: `old-magic-link-${suffix}` } } }),
      prisma.account.count({ where: { userId: a.id } }),
    ]);
    deletionId = (await prisma.accountDeletion.findUnique({ where: { userId: a.id }, select: { id: true } }))!.id;
    assert.equal(tombstone?.deletedAt instanceof Date, true);
    assert.equal(tombstone?.email, null);
    assert.equal(tombstone?.name, null);
    assert.equal(tombstone?.image, null);
    assert.equal(tombstone?.username, null);
    assert.equal(oldCredential, null);
    assert.equal(oldSession, null);
    assert.equal(oldAction, null);
    assert.equal(oldMagicLink, null);
    assert.equal(remainingAccounts, 0);
    assert.equal(await prisma.appleAccountEvent.count({ where: { providerAccountId: appleSubject } }), 0);
    assert.equal(await getDatabaseSessionFromRequest(new Request("http://localhost", { headers: { cookie: `authjs.session-token=old-session-${suffix}` } })), null);
    assert.equal((await getUserEntitlements(a.id)).entitlements.isPro, false,
      "active retained billing records do not grant access to a deleted account");

    const oldLogin = await passwordLoginRoute.POST(new Request("http://localhost:3000/api/auth/password/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": `192.0.2.10` },
      body: JSON.stringify({ email, password: "old-account-password-123" }),
    }));
    assert.equal(oldLogin.status, 401);

    const replacementPassword = "new-account-password-456";
    const [firstHash, secondHash] = await Promise.all([
      hashPassword(replacementPassword),
      hashPassword(replacementPassword),
    ]);
    const concurrentRegistrations = await Promise.allSettled([
      createPasswordAccount({ emailNormalized: email, passwordHash: firstHash }),
      createPasswordAccount({ emailNormalized: email, passwordHash: secondHash }),
    ]);
    const successfulRegistrations = concurrentRegistrations.filter(
      (result): result is PromiseFulfilledResult<{ id: string }> => result.status === "fulfilled"
    );
    const failedRegistrations = concurrentRegistrations.filter((result) => result.status === "rejected");
    assert.equal(successfulRegistrations.length, 1, "one concurrent registration creates the new canonical user");
    assert.equal(failedRegistrations.length, 1, "the unique email constraint rejects the competing registration");
    const competingError = (failedRegistrations[0] as PromiseRejectedResult).reason;
    assert.ok(competingError instanceof Prisma.PrismaClientKnownRequestError);
    assert.equal(competingError.code, "P2002");
    bId = successfulRegistrations[0]!.value.id;
    assert.notEqual(bId, a.id);
    await prisma.account.createMany({
      data: [
        { userId: bId, provider: "google", providerAccountId: googleSubject, type: "oauth" },
        { userId: bId, provider: "apple", providerAccountId: appleSubject, type: "oidc" },
      ],
    });
    const newEncrypted = encryptAuthToken("synthetic-new-apple-refresh-token");
    await prisma.appleAuthorization.create({
      data: {
        userId: bId,
        providerAccountId: appleSubject,
        clientId: "com.example.integration",
        refreshTokenCiphertext: newEncrypted.ciphertext,
        refreshTokenIv: newEncrypted.iv,
        refreshTokenTag: newEncrypted.tag,
        encryptionKeyId: newEncrypted.keyId,
      },
    });
    await prisma.session.create({
      data: { userId: bId, sessionToken: `new-session-${suffix}`, expires: new Date(now.getTime() + 60_000), authenticatedAt: now, authProvider: "apple" },
    });
    const newWorkout = await prisma.workout.create({ data: { userId: bId, title: "New account workout", visibility: "PRIVATE" } });
    const verificationToken = `verify-new-${suffix}`;
    await prisma.authActionToken.create({
      data: {
        userId: bId,
        purpose: "EMAIL_VERIFICATION",
        tokenHash: hashAuthSecret(verificationToken),
        emailNormalized: email,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    const verificationResponse = await verifyEmailRoute.POST(new Request("http://localhost:3000/api/auth/password/verify-email", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ token: verificationToken }),
    }));
    assert.equal(verificationResponse.status, 200, "new registration must complete its own email verification");

    const oldPasswordAfterRegistration = await passwordLoginRoute.POST(new Request("http://localhost:3000/api/auth/password/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "192.0.2.11" },
      body: JSON.stringify({ email, password: "old-account-password-123" }),
    }));
    assert.equal(oldPasswordAfterRegistration.status, 401);
    const newPasswordLogin = await passwordLoginRoute.POST(new Request("http://localhost:3000/api/auth/password/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "192.0.2.12" },
      body: JSON.stringify({ email, password: "new-account-password-456" }),
    }));
    assert.equal(newPasswordLogin.status, 200);

    const staleEventTime = new Date(now.getTime() - 60_000);
    await applyVerifiedAppleAccountEvent({
      jti: `delayed-old-revocation-${suffix}`,
      type: "consent-revoked",
      providerAccountId: appleSubject,
      email,
      privateRelay: false,
      eventTime: staleEventTime,
    });
    assert.equal((await prisma.appleAuthorization.findUnique({ where: { userId: bId } }))?.revokedAt, null,
      "a delayed event predating the new Apple authorization must not revoke the new account");
    assert.equal(await prisma.session.count({ where: { userId: bId, authProvider: "apple" } }), 1);
    assert.equal(await prisma.appleAccountEvent.count({ where: { jti: `delayed-old-revocation-${suffix}` } }), 0,
      "stale event PII is not retained");

    await prisma.appleAuthorization.update({ where: { userId: a.id }, data: { revokedAt: now } });
    await prisma.accountDeletion.update({ where: { id: deletionId }, data: { appleRevocationStatus: "COMPLETED" } });
    const cleanup = await processAccountDeletionBatch({
      accountDeletionId: deletionId,
      dependencies: {
        deleteWorkoutObject: async () => undefined,
        deleteParkObject: async () => undefined,
        revokeAppleAuthorization: async () => true,
      },
    });
    assert.equal(cleanup.completed, 1);

    const [oldAfterCleanup, newAfterCleanup, oldSubscription, retainedPurchase, retainedMapping, oldWorkoutAfterCleanup, newWorkoutAfterCleanup, newEntitlements] = await Promise.all([
      prisma.user.findUnique({ where: { id: a.id }, select: { id: true, deletedAt: true, email: true } }),
      prisma.user.findUnique({ where: { id: bId }, select: { id: true, deletedAt: true, email: true } }),
      prisma.subscription.findUnique({ where: { userId: a.id } }),
      prisma.applePurchase.findUnique({ where: { id: lifetimePurchase.id } }),
      prisma.deletedAppleAccountMapping.findUnique({ where: { appAccountToken } }),
      prisma.workout.findUnique({ where: { id: oldWorkout.id } }),
      prisma.workout.findUnique({ where: { id: newWorkout.id } }),
      getUserEntitlements(bId),
    ]);
    assert.deepEqual(oldAfterCleanup, { id: a.id, deletedAt: oldAfterCleanup?.deletedAt, email: null });
    assert.ok(oldAfterCleanup?.deletedAt);
    assert.equal(newAfterCleanup?.id, bId);
    assert.equal(newAfterCleanup?.deletedAt, null);
    assert.equal(newAfterCleanup?.email, email);
    assert.equal(oldSubscription?.id, subscription.id, "deletion retains old billing records without transferring them");
    assert.equal(retainedPurchase?.userId, a.id);
    assert.equal(retainedMapping?.accountDeletionId, deletionId);
    assert.equal(oldWorkoutAfterCleanup, null);
    assert.equal(newWorkoutAfterCleanup?.userId, bId, "old-account cleanup cannot delete new-account data");
    assert.equal(newEntitlements.entitlements.isPro, false);

    await assert.rejects(
      synchronizeOwnedAppleTransaction({
        authenticatedUserId: bId,
        transaction: {
          environment: "PRODUCTION",
          transactionId: `transaction-${suffix}`,
          originalTransactionId: `original-${suffix}`,
          bundleId: "com.petershikrenov.calistheni",
          productId: "com.example.lifetime",
          productKind: "LIFETIME",
          appAccountToken,
          purchaseDate: now,
          expiresDate: null,
          revocationDate: null,
          ownershipType: "PURCHASED",
          signedDate: now,
          payloadHash: "a".repeat(64),
        },
        repository: appleOwnershipRepository,
      }),
      (error) => error instanceof AppleTransactionOwnershipError,
      "Apple restoration tied to the deleted account cannot transfer to the new account"
    );
  } finally {
    await prisma.appleAccountEvent.deleteMany({ where: { providerAccountId: appleSubject } });
    if (deletionId) {
      await prisma.restrictedFinancialReference.deleteMany({ where: { accountDeletionId: deletionId } });
      await prisma.deletedAppleAccountMapping.deleteMany({ where: { accountDeletionId: deletionId } });
      await prisma.deletionCommunityReviewTask.deleteMany({ where: { accountDeletionId: deletionId } });
    }
    await prisma.accountDeletion.deleteMany({ where: { userId: a.id } });
    await prisma.user.deleteMany({ where: { id: { in: [a.id, ...(bId ? [bId] : [])] } } });
    await prisma.$disconnect();
  }
});

test("a registration racing account deactivation can only create a fresh canonical user", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { deactivateAccountForDeletion }, { createPasswordAccount }, { hashPassword }, { Prisma }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion.ts"),
    import("../../lib/auth/password-registration.ts"),
    import("../../lib/auth/password-core.ts"),
    import("../../lib/generated/prisma/client.ts"),
  ]);
  const suffix = `${Date.now()}-${randomUUID()}`;
  const email = `deletion-race-${suffix}@example.test`;
  const deletedUser = await prisma.user.create({ data: { email } });
  let newUserId: string | null = null;
  try {
    const hash = await hashPassword("concurrent-registration-password-789");
    const [deactivation, registration] = await Promise.all([
      deactivateAccountForDeletion(deletedUser.id),
      createPasswordAccount({ emailNormalized: email, passwordHash: hash }).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason })
      ),
    ]);
    assert.ok(deactivation.state === "DEACTIVATED" || deactivation.state === "ALREADY_DEACTIVATED");
    if (registration.status === "fulfilled") {
      newUserId = registration.value.id;
    } else {
      assert.ok(registration.reason instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal(registration.reason.code, "P2002");
      newUserId = (await createPasswordAccount({ emailNormalized: email, passwordHash: hash })).id;
    }
    assert.notEqual(newUserId, deletedUser.id);
    const [oldRow, newRow, activeMatches] = await Promise.all([
      prisma.user.findUnique({ where: { id: deletedUser.id }, select: { id: true, deletedAt: true, email: true } }),
      prisma.user.findUnique({ where: { id: newUserId }, select: { id: true, deletedAt: true, email: true } }),
      prisma.user.count({ where: { email, deletedAt: null } }),
    ]);
    assert.ok(oldRow?.deletedAt);
    assert.equal(oldRow?.email, null);
    assert.equal(newRow?.id, newUserId);
    assert.equal(newRow?.deletedAt, null);
    assert.equal(newRow?.email, email);
    assert.equal(activeMatches, 1);
  } finally {
    await prisma.accountDeletion.deleteMany({ where: { userId: deletedUser.id } });
    await prisma.user.deleteMany({ where: { id: { in: [deletedUser.id, ...(newUserId ? [newUserId] : [])] } } });
    await prisma.$disconnect();
  }
});
