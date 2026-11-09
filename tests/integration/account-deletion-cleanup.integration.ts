import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test("deletion worker anonymizes a tombstone, retains billing, and preserves unrelated users", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { processAccountDeletionBatch }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const account = await prisma.user.create({ data: { email: `cleanup-${marker}@example.test`, name: "Private Name" } });
  const unrelated = await prisma.user.create({ data: { email: `untouched-${marker}@example.test` } });
  const subscription = await prisma.subscription.create({
    data: { userId: account.id, stripeCustomerId: `cus_cleanup_${marker}`, stripeSubscriptionId: `sub_cleanup_${marker}`, status: "ACTIVE", plan: "PRO_MONTHLY" },
  });
  const deletion = await prisma.accountDeletion.create({
    data: {
      userId: account.id,
      status: "DEACTIVATED",
      requestedAt: new Date(),
      deactivatedAt: new Date(),
      cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      appleRevocationStatus: "NOT_REQUIRED",
    },
  });
  await prisma.user.update({ where: { id: account.id }, data: { deletedAt: new Date() } });

  try {
    const result = await processAccountDeletionBatch({
      accountDeletionId: deletion.id,
      dependencies: {
        deleteWorkoutObject: async () => undefined,
        deleteParkObject: async () => undefined,
        revokeAppleAuthorization: async () => true,
      },
    });
    assert.equal(result.claimed, 1);
    assert.equal(result.completed, 1);
    const [storedUser, storedSubscription, financialReference, storedDeletion, preservedUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: account.id } }),
      prisma.subscription.findUnique({ where: { userId: account.id } }),
      prisma.restrictedFinancialReference.findFirst({ where: { accountDeletionId: deletion.id, sourceRecordId: subscription.id } }),
      prisma.accountDeletion.findUnique({ where: { id: deletion.id } }),
      prisma.user.findUnique({ where: { id: unrelated.id } }),
    ]);
    assert.equal(storedUser?.deletedAt instanceof Date, true);
    assert.equal(storedUser?.email, null);
    assert.equal(storedUser?.name, null);
    assert.equal(storedSubscription?.id, subscription.id);
    assert.equal(storedSubscription?.status, "ACTIVE");
    assert.ok(financialReference);
    assert.equal(storedDeletion?.status, "CLEANUP_COMPLETED");
    assert.equal(preservedUser?.email, `untouched-${marker}@example.test`);
  } finally {
    await prisma.restrictedFinancialReference.deleteMany({ where: { accountDeletionId: deletion.id } });
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.subscription.deleteMany({ where: { userId: { in: [account.id, unrelated.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [account.id, unrelated.id] } } });
    await prisma.$disconnect();
  }
});

test("worker retries a failed Apple revocation and completes after retry state is resolved", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { processAccountDeletionBatch }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `cleanup-retry-${marker}@example.test` } });
  const deletion = await prisma.accountDeletion.create({
    data: {
      userId: user.id,
      status: "DEACTIVATED",
      requestedAt: new Date(),
      deactivatedAt: new Date(),
      cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      appleRevocationStatus: "PENDING",
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
  try {
    const failed = await processAccountDeletionBatch({
      accountDeletionId: deletion.id,
      dependencies: {
        deleteWorkoutObject: async () => undefined,
        deleteParkObject: async () => undefined,
        revokeAppleAuthorization: async () => { throw new Error("transient provider failure"); },
      },
    });
    assert.equal(failed.retried, 1);
    assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } }))?.status, "CLEANUP_RETRY");

    await prisma.accountDeletion.update({ where: { id: deletion.id }, data: { appleRevocationStatus: "NOT_REQUIRED" } });
    const retried = await processAccountDeletionBatch({
      accountDeletionId: deletion.id,
      dependencies: {
        deleteWorkoutObject: async () => undefined,
        deleteParkObject: async () => undefined,
        revokeAppleAuthorization: async () => true,
      },
    });
    assert.equal(retried.completed, 1);
    assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } }))?.status, "CLEANUP_COMPLETED");
  } finally {
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test("worker claims a deletion once under concurrency and recovers an expired lease", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { processAccountDeletionBatch, accountDeletionWorkerAuthorized }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `cleanup-lease-${marker}@example.test`, deletedAt: new Date() } });
  const deletion = await prisma.accountDeletion.create({
    data: {
      userId: user.id,
      status: "CLEANUP_PROCESSING",
      requestedAt: new Date(),
      deactivatedAt: new Date(),
      cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      processingLeaseId: "expired-test-lease",
      processingLeaseExpiresAt: new Date(Date.now() - 1000),
      appleRevocationStatus: "NOT_REQUIRED",
    },
  });
  try {
    const authSecret = "account-deletion-worker-test-secret-with-32-chars";
    assert.equal(accountDeletionWorkerAuthorized(new Request("https://local.test/cron"), authSecret), false);
    assert.equal(accountDeletionWorkerAuthorized(new Request("https://local.test/cron", { headers: { authorization: `Bearer ${authSecret}` } }), authSecret), true);
    const dependencies = {
      deleteWorkoutObject: async () => undefined,
      deleteParkObject: async () => undefined,
      revokeAppleAuthorization: async () => true,
    };
    const [first, second] = await Promise.all([
      processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies }),
      processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies }),
    ]);
    assert.equal(first.claimed + second.claimed, 1);
    assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } }))?.status, "CLEANUP_COMPLETED");
  } finally {
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test("failed workout R2 media deletion is retried and then removed", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { processAccountDeletionBatch }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `cleanup-media-${marker}@example.test`, deletedAt: new Date() } });
  const workout = await prisma.workout.create({ data: { userId: user.id, title: "Private workout" } });
  const workoutKey = `users/${user.id}/workouts/${workout.id}/${randomUUID()}.webp`;
  await prisma.workoutPhoto.create({ data: {
    workoutId: workout.id,
    userId: user.id,
    storageKey: workoutKey,
    width: 100,
    height: 100,
    fileSizeBytes: 1024,
    mimeType: "image/webp",
    originalFileName: "private.webp",
  } });
  const deletion = await prisma.accountDeletion.create({
    data: {
      userId: user.id,
      status: "DEACTIVATED",
      requestedAt: new Date(),
      deactivatedAt: new Date(),
      cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      appleRevocationStatus: "NOT_REQUIRED",
    },
  });
  let deleteAttempts = 0;
  const baseDependencies = {
    deleteWorkoutObject: async () => {
      deleteAttempts += 1;
      if (deleteAttempts === 1) {
        throw new Error("simulated object-storage outage");
      }
    },
    deleteParkObject: async () => undefined,
    revokeAppleAuthorization: async () => true,
  };
  try {
    const first = await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: baseDependencies });
    assert.equal(first.retried, 1);
    assert.equal((await prisma.deletionCommunityReviewTask.findFirst({ where: { accountDeletionId: deletion.id, resourceId: workoutKey } }))?.status, "RETRY");

    const second = await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: baseDependencies });
    assert.equal(second.claimed, 1);
    const [mediaTask, storedWorkoutPhoto, storedDeletion] = await Promise.all([
      prisma.deletionCommunityReviewTask.findFirst({ where: { accountDeletionId: deletion.id, resourceId: workoutKey } }),
      prisma.workoutPhoto.findUnique({ where: { storageKey: workoutKey } }),
      prisma.accountDeletion.findUnique({ where: { id: deletion.id } }),
    ]);
    assert.equal(deleteAttempts, 2);
    assert.equal(mediaTask?.status, "RESOLVED");
    assert.equal(storedWorkoutPhoto, null);
    assert.equal(storedDeletion?.status, "CLEANUP_COMPLETED");
  } finally {
    await prisma.deletionCommunityReviewTask.deleteMany({ where: { accountDeletionId: deletion.id } });
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.workout.deleteMany({ where: { id: workout.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test("deletion preserves R2 park media referenced by another park through photoUrl only", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.PARK_PHOTO_R2_PUBLIC_URL = "https://media.example.test";
  process.env.PARK_PHOTO_R2_BUCKET_NAME = "local-test-bucket";
  process.env.PARK_PHOTO_R2_ENDPOINT = "https://local-test.r2.cloudflarestorage.com";
  process.env.PARK_PHOTO_R2_ACCESS_KEY_ID = "local-test-access";
  process.env.PARK_PHOTO_R2_SECRET_ACCESS_KEY = "local-test-secret";
  const [{ prisma }, { processAccountDeletionBatch }, { reviewDeletionCommunityTask }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
    import("../../lib/account-deletion-review.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `cleanup-shared-media-${marker}@example.test`, deletedAt: new Date() } });
  const key = `parks/${user.id}/${marker}.webp`;
  const ownPark = await prisma.park.create({
    data: { name: "Submitted park", lat: 42.7, lon: 23.3, submissionStatus: "APPROVED", submittedById: user.id, photoKey: key, photoUrl: `https://media.example.test/${key}` },
  });
  const sharedKeyPark = await prisma.park.create({
    data: { name: "Shared park key reference", lat: 42.75, lon: 23.35, submissionStatus: "APPROVED", photoKey: key },
  });
  const sharedUrlPark = await prisma.park.create({
    data: { name: "Shared park", lat: 42.8, lon: 23.4, submissionStatus: "APPROVED", photoUrl: `https://media.example.test/parks/${user.id}/${marker}%2Ewebp?size=large` },
  });
  const deletion = await prisma.accountDeletion.create({
    data: { userId: user.id, status: "DEACTIVATED", requestedAt: new Date(), deactivatedAt: new Date(), cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000), appleRevocationStatus: "NOT_REQUIRED" },
  });
  let deleteCalls = 0;
  try {
    const result = await processAccountDeletionBatch({
      accountDeletionId: deletion.id,
      dependencies: {
        deleteWorkoutObject: async () => undefined,
        deleteParkObject: async () => { deleteCalls += 1; },
        revokeAppleAuthorization: async () => true,
      },
    });
    assert.equal(deleteCalls, 0);
    assert.equal(result.completed, 0);
    const [storedSharedPark, mediaTask] = await Promise.all([
      prisma.park.findUnique({ where: { id: sharedUrlPark.id } }),
      prisma.deletionCommunityReviewTask.findFirst({ where: { accountDeletionId: deletion.id, resourceKind: "MEDIA", resourceId: key } }),
    ]);
    assert.equal(storedSharedPark?.photoUrl, `https://media.example.test/parks/${user.id}/${marker}%2Ewebp?size=large`);
    assert.equal((await prisma.park.findUnique({ where: { id: sharedKeyPark.id } }))?.photoKey, key);
    assert.equal(mediaTask?.status, "RETRY");
    assert.equal(mediaTask?.lastErrorCategory, "PARK_REVIEW_PENDING");
    assert.equal((await prisma.park.findUnique({ where: { id: ownPark.id } }))?.submissionStatus, "PENDING");

    const parkReview = await prisma.deletionCommunityReviewTask.findFirstOrThrow({ where: { accountDeletionId: deletion.id, resourceKind: "PARK", resourceId: String(ownPark.id) }, select: { id: true } });
    await reviewDeletionCommunityTask(parkReview.id, "KEEP_ANONYMIZED");
    const afterReview = await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: { deleteWorkoutObject: async () => undefined, deleteParkObject: async () => { deleteCalls += 1; }, revokeAppleAuthorization: async () => true } });
    assert.equal(deleteCalls, 0);
    assert.equal(afterReview.completed, 1);
    assert.equal((await prisma.deletionCommunityReviewTask.findFirst({ where: { accountDeletionId: deletion.id, resourceKind: "MEDIA", resourceId: key } }))?.status, "RESOLVED");
    assert.equal((await prisma.park.findUnique({ where: { id: sharedUrlPark.id } }))?.photoUrl, `https://media.example.test/parks/${user.id}/${marker}%2Ewebp?size=large`);
  } finally {
    await prisma.deletionCommunityReviewTask.deleteMany({ where: { accountDeletionId: deletion.id } });
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.park.deleteMany({ where: { id: { in: [ownPark.id, sharedKeyPark.id, sharedUrlPark.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test("concurrent account cleanup attempts cannot delete a shared park object", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.PARK_PHOTO_R2_PUBLIC_URL = "https://media.example.test";
  process.env.PARK_PHOTO_R2_BUCKET_NAME = "local-test-bucket";
  process.env.PARK_PHOTO_R2_ENDPOINT = "https://local-test.r2.cloudflarestorage.com";
  process.env.PARK_PHOTO_R2_ACCESS_KEY_ID = "local-test-access";
  process.env.PARK_PHOTO_R2_SECRET_ACCESS_KEY = "local-test-secret";
  const [{ prisma }, { processAccountDeletionBatch }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [firstUser, secondUser, activeUser] = await Promise.all([
    prisma.user.create({ data: { email: `cleanup-shared-a-${marker}@example.test`, deletedAt: new Date() } }),
    prisma.user.create({ data: { email: `cleanup-shared-b-${marker}@example.test`, deletedAt: new Date() } }),
    prisma.user.create({ data: { email: `cleanup-shared-active-${marker}@example.test` } }),
  ]);
  const key = `parks/${firstUser.id}/${marker}.webp`;
  const sharedPark = await prisma.park.create({ data: { name: "Shared park", lat: 42.8, lon: 23.4, submissionStatus: "APPROVED", submittedById: activeUser.id, photoKey: key, photoUrl: `https://media.example.test/${key}` } });
  const [firstPhoto, secondPhoto] = await Promise.all([
    prisma.parkPhoto.create({ data: { parkId: sharedPark.id, url: `https://media.example.test/${key}`, uploadedById: firstUser.id } }),
    prisma.parkPhoto.create({ data: { parkId: sharedPark.id, url: `https://media.example.test/${key}?v=2`, uploadedById: secondUser.id } }),
  ]);
  const now = new Date();
  const deletions = await Promise.all([firstUser, secondUser].map((user) => prisma.accountDeletion.create({
    data: { userId: user.id, status: "DEACTIVATED", requestedAt: now, deactivatedAt: now, cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000), appleRevocationStatus: "NOT_REQUIRED" },
  })));
  let deleteCalls = 0;
  const dependencies = { deleteWorkoutObject: async () => undefined, deleteParkObject: async () => { deleteCalls += 1; }, revokeAppleAuthorization: async () => true };
  try {
    const results = await Promise.all(deletions.map((deletion) => processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies })));
    assert.equal(results.reduce((sum, result) => sum + result.claimed, 0), 2);
    assert.equal(deleteCalls, 0);
    assert.equal((await prisma.park.findUnique({ where: { id: sharedPark.id } }))?.photoUrl, `https://media.example.test/${key}`);
    assert.equal(await prisma.parkPhoto.count({ where: { id: { in: [firstPhoto.id, secondPhoto.id] } } }), 0);
  } finally {
    await prisma.deletionCommunityReviewTask.deleteMany({ where: { accountDeletionId: { in: deletions.map(({ id }) => id) } } });
    await prisma.accountDeletion.deleteMany({ where: { id: { in: deletions.map(({ id }) => id) } } });
    await prisma.park.deleteMany({ where: { id: sharedPark.id } });
    await prisma.user.deleteMany({ where: { id: { in: [firstUser.id, secondUser.id, activeUser.id] } } });
    await prisma.$disconnect();
  }
});

test("food review tasks cover multiple bounded pages and hide all pending foods", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { processAccountDeletionBatch }, { reviewDeletionCommunityTask }, { nutritionFoodVisibilityWhere }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
    import("../../lib/account-deletion-review.ts"),
    import("../../lib/nutrition/food-visibility.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `cleanup-food-pages-${marker}@example.test`, deletedAt: new Date() } });
  const foods = [];
  for (let index = 0; index < 57; index += 1) {
    foods.push(await prisma.food.create({ data: {
      type: "USER_CREATED",
      name: `Private contribution ${index}`,
      normalizedName: `private-contribution-${marker}-${index}`,
      source: "USER",
      sourceExternalId: `${marker}-${index}`,
      verificationStatus: "COMMUNITY_SOURCE",
      contributionStatus: "PENDING",
      createdByUserId: user.id,
    } }));
  }
  const revision = await prisma.foodRevision.create({
    data: {
      foodId: foods[0].id,
      revisionNumber: 1,
      reason: "USER_CORRECTION",
      source: "USER",
      sourceExternalId: `${marker}-revision`,
      name: `Private revision ${marker}`,
      verificationStatus: "UNVERIFIED",
      normalizedDataChecksum: `checksum-${marker}`,
      createdByUserId: user.id,
    },
  });
  await prisma.foodAlias.create({ data: { foodId: foods[0].id, name: `Private alias ${marker}`, normalizedName: `private-alias-${marker}`, source: "USER" } });
  const deletion = await prisma.accountDeletion.create({
    data: { userId: user.id, status: "DEACTIVATED", requestedAt: new Date(), deactivatedAt: new Date(), cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000), appleRevocationStatus: "NOT_REQUIRED" },
  });
  const workerDependencies = { deleteWorkoutObject: async () => undefined, deleteParkObject: async () => undefined, revokeAppleAuthorization: async () => true };
  try {
    await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: workerDependencies });
    const firstPageTask = await prisma.deletionCommunityReviewTask.findFirstOrThrow({ where: { accountDeletionId: deletion.id, resourceKind: "FOOD" }, select: { id: true } });
    await assert.rejects(reviewDeletionCommunityTask(firstPageTask.id, "KEEP_ANONYMIZED"), /FOOD_REVIEW_SCAN_INCOMPLETE/);
    await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: workerDependencies });
    await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: workerDependencies });

    const [tasks, pendingFoods, storedRevision, storedAlias] = await Promise.all([
      prisma.deletionCommunityReviewTask.findMany({ where: { accountDeletionId: deletion.id, resourceKind: "FOOD" }, select: { id: true, resourceId: true, status: true } }),
      prisma.food.findMany({ where: { id: { in: foods.map(({ id }) => id) }, ...nutritionFoodVisibilityWhere("unrelated-user") }, select: { id: true } }),
      prisma.foodRevision.findUnique({ where: { id: revision.id } }),
      prisma.foodAlias.findFirst({ where: { foodId: foods[0].id, source: "USER" } }),
    ]);
    assert.equal(tasks.length, 58);
    assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } }))?.foodReviewScanComplete, true);
    assert.equal(new Set(tasks.map(({ resourceId }) => resourceId)).size, 58);
    assert.ok(tasks.every(({ status }) => status === "PENDING"));
    assert.equal(pendingFoods.length, 0);
    assert.equal(storedRevision?.createdByUserId, null);
    assert.ok(storedAlias);

    // Repeating a worker pass cannot duplicate tasks or skip previously
    // de-attributed food/revision rows; pending review still blocks completion.
    await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: workerDependencies });
    assert.equal(await prisma.deletionCommunityReviewTask.count({ where: { accountDeletionId: deletion.id, resourceKind: "FOOD" } }), 58);
    assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } }))?.status, "CLEANUP_RETRY");

    for (const task of tasks) await reviewDeletionCommunityTask(task.id, "KEEP_ANONYMIZED");
    await processAccountDeletionBatch({ accountDeletionId: deletion.id, dependencies: workerDependencies });
    assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } }))?.status, "CLEANUP_COMPLETED");
    assert.equal(await prisma.food.count({ where: { id: { in: foods.map(({ id }) => id) }, contributionStatus: "APPROVED", createdByUserId: null } }), 57);
  } finally {
    await prisma.deletionCommunityReviewTask.deleteMany({ where: { accountDeletionId: deletion.id } });
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.food.deleteMany({ where: { id: { in: foods.map(({ id }) => id) } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test("admin review resolves or removes hidden community contributions before cleanup completion", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { reviewDeletionCommunityTask }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-review.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `cleanup-review-${marker}@example.test`, deletedAt: new Date() } });
  const deletion = await prisma.accountDeletion.create({
    data: {
      userId: user.id,
      status: "CLEANUP_RETRY",
      requestedAt: new Date(),
      deactivatedAt: new Date(),
      cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      appleRevocationStatus: "NOT_REQUIRED",
    },
  });
  const removedPark = await prisma.park.create({ data: { name: "Personal park name", address: "Personal address", lat: 42.7, lon: 23.3, submissionStatus: "PENDING" } });
  const keptPark = await prisma.park.create({ data: { name: "Approved park", lat: 42.8, lon: 23.4, submissionStatus: "PENDING" } });
  const food = await prisma.food.create({
    data: {
      type: "USER_CREATED",
      name: "Private food contribution",
      normalizedName: `private-food-${marker}`,
      brandName: "Personal brand details",
      barcode: `test-${marker}`,
      source: "USER",
      sourceExternalId: marker,
      verificationStatus: "COMMUNITY_SOURCE",
      contributionStatus: "PENDING",
      createdByUserId: user.id,
    },
  });
  const tasks = await prisma.deletionCommunityReviewTask.createMany({
    data: [
      { accountDeletionId: deletion.id, resourceKind: "PARK", resourceId: String(removedPark.id), cleanupDeadline: deletion.cleanupDeadline },
      { accountDeletionId: deletion.id, resourceKind: "PARK", resourceId: String(keptPark.id), cleanupDeadline: deletion.cleanupDeadline },
      { accountDeletionId: deletion.id, resourceKind: "FOOD", resourceId: food.id, cleanupDeadline: deletion.cleanupDeadline },
    ],
  });
  assert.equal(tasks.count, 3);
  await prisma.accountDeletion.update({
    where: { id: deletion.id },
    data: { foodReviewScanComplete: true },
  });
  try {
    const [removeTask, keepTask, foodTask] = await Promise.all([
      prisma.deletionCommunityReviewTask.findFirstOrThrow({ where: { accountDeletionId: deletion.id, resourceId: String(removedPark.id) }, select: { id: true } }),
      prisma.deletionCommunityReviewTask.findFirstOrThrow({ where: { accountDeletionId: deletion.id, resourceId: String(keptPark.id) }, select: { id: true } }),
      prisma.deletionCommunityReviewTask.findFirstOrThrow({ where: { accountDeletionId: deletion.id, resourceId: food.id }, select: { id: true } }),
    ]);
    assert.equal(await reviewDeletionCommunityTask(removeTask.id, "REMOVE_FROM_PUBLIC"), "REMOVED_FROM_PUBLIC");
    assert.equal(await reviewDeletionCommunityTask(keepTask.id, "KEEP_ANONYMIZED"), "RESOLVED");
    assert.equal(await reviewDeletionCommunityTask(foodTask.id, "REMOVE_FROM_PUBLIC"), "REMOVED_FROM_PUBLIC");

    const [removed, kept, removedFood, openTasks] = await Promise.all([
      prisma.park.findUnique({ where: { id: removedPark.id } }),
      prisma.park.findUnique({ where: { id: keptPark.id } }),
      prisma.food.findUnique({ where: { id: food.id } }),
      prisma.deletionCommunityReviewTask.count({ where: { accountDeletionId: deletion.id, status: { in: ["PENDING", "RETRY", "PROCESSING"] } } }),
    ]);
    assert.equal(removed?.name, "Community park");
    assert.equal(removed?.address, null);
    assert.ok(removed?.deletedAt);
    assert.equal(kept?.submissionStatus, "APPROVED");
    assert.equal(kept?.submittedById, null);
    assert.equal(removedFood?.name, "Removed contribution");
    assert.equal(removedFood?.barcode, null);
    assert.equal(removedFood?.createdByUserId, null);
    assert.equal(openTasks, 0);
  } finally {
    await prisma.deletionCommunityReviewTask.deleteMany({ where: { accountDeletionId: deletion.id } });
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.park.deleteMany({ where: { id: { in: [removedPark.id, keptPark.id] } } });
    await prisma.food.deleteMany({ where: { id: food.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test("deleted Apple accounts retain notification routing without restoring the account", { skip: !safeLocalDatabase }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, { processAccountDeletionBatch }, { appleOwnershipRepository }] = await Promise.all([
    import("../../lib/prisma.ts"),
    import("../../lib/account-deletion-worker.ts"),
    import("../../lib/apple-iap/persistence.ts"),
  ]);
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const appAccountToken = randomUUID();
  const user = await prisma.user.create({ data: { email: `cleanup-apple-${marker}@example.test`, deletedAt: new Date() } });
  const deletion = await prisma.accountDeletion.create({
    data: {
      userId: user.id,
      status: "DEACTIVATED",
      requestedAt: new Date(),
      deactivatedAt: new Date(),
      cleanupDeadline: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      appleRevocationStatus: "NOT_REQUIRED",
    },
  });
  await prisma.appleBillingAccount.create({ data: { userId: user.id, appAccountToken } });
  try {
    const result = await processAccountDeletionBatch({
      accountDeletionId: deletion.id,
      dependencies: {
        deleteWorkoutObject: async () => undefined,
        deleteParkObject: async () => undefined,
        revokeAppleAuthorization: async () => true,
      },
    });
    assert.equal(result.completed, 1);
    assert.equal(await prisma.appleBillingAccount.count({ where: { userId: user.id } }), 0);
    const mapping = await prisma.deletedAppleAccountMapping.findUnique({ where: { appAccountToken } });
    assert.equal(mapping?.accountDeletionId, deletion.id);
    assert.equal(await appleOwnershipRepository.findUserIdByAppAccountToken(appAccountToken, "PRODUCTION"), user.id);
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } }))?.deletedAt instanceof Date, true);
  } finally {
    await prisma.deletedAppleAccountMapping.deleteMany({ where: { appAccountToken } });
    await prisma.restrictedFinancialReference.deleteMany({ where: { accountDeletionId: deletion.id } });
    await prisma.accountDeletion.deleteMany({ where: { id: deletion.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
