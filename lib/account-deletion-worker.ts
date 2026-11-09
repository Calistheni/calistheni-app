import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getParkPhotoKeyFromUrl, getParkPhotoUrlFromKey, deleteParkPhotoObject } from "@/lib/park-photo-storage";
import { deleteWorkoutPhotoObject } from "@/lib/workout-photo-storage";
import { isSafeParkPhotoObjectKey } from "@/lib/park-photo-keys";
import { isWorkoutPhotoKey } from "@/lib/workout-photo";
import { attemptAppleAuthorizationRevocation } from "@/lib/account-deletion";

const LEASE_MS = 5 * 60_000;
const BATCH_SIZE = 50;
const MEDIA_BATCH_SIZE = 20;
const MAX_ACCOUNT_PASSES = 8;

type WorkerDependencies = {
  deleteWorkoutObject: (key: string) => Promise<void>;
  deleteParkObject: (key: string) => Promise<void>;
  revokeAppleAuthorization: (userId: string, now?: Date) => Promise<boolean>;
  now: () => Date;
};

const defaultDependencies: WorkerDependencies = {
  deleteWorkoutObject: deleteWorkoutPhotoObject,
  deleteParkObject: deleteParkPhotoObject,
  revokeAppleAuthorization: attemptAppleAuthorizationRevocation,
  now: () => new Date(),
};

type ClaimedDeletion = { id: string; userId: string; cleanupDeadline: Date; leaseId: string };

function normalizedObjectKey(key: string) {
  if (isWorkoutPhotoKey(key) || (isSafeParkPhotoObjectKey(key) && (key.startsWith("parks/") || key.startsWith("pending/parks/")))) return key;
  return null;
}

async function refreshLease(deletion: ClaimedDeletion, now: Date) {
  const result = await prisma.accountDeletion.updateMany({
    where: {
      id: deletion.id,
      status: "CLEANUP_PROCESSING",
      processingLeaseId: deletion.leaseId,
    },
    data: { processingLeaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (result.count !== 1) throw new Error("DELETION_LEASE_LOST");
}

async function claimDeletions(limit: number, now: Date, accountDeletionId?: string): Promise<ClaimedDeletion[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; userId: string; cleanupDeadline: Date }>>`
      SELECT "id", "userId", "cleanupDeadline" FROM "AccountDeletion"
      WHERE (${accountDeletionId ?? null}::text IS NULL OR "id" = ${accountDeletionId ?? ""})
        AND ("status" IN ('DEACTIVATED', 'CLEANUP_PENDING', 'CLEANUP_RETRY')
        OR ("status" = 'CLEANUP_PROCESSING' AND "processingLeaseExpiresAt" <= ${now})
        )
      ORDER BY "requestedAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;
    const claimed: ClaimedDeletion[] = [];
    for (const row of rows) {
      const leaseId = randomUUID();
      await tx.accountDeletion.update({
        where: { id: row.id },
        data: {
          status: "CLEANUP_PROCESSING",
          processingLeaseId: leaseId,
          processingLeaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          lastAttemptAt: now,
          retryCount: { increment: 1 },
          lastErrorCategory: null,
        },
      });
      claimed.push({ ...row, leaseId });
    }
    return claimed;
  });
}

async function preserveFinancialReferences(deletion: ClaimedDeletion) {
  const [stripe, billing, applePurchases, appleTransactions] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId: deletion.userId } }),
    prisma.appleBillingAccount.findUnique({ where: { userId: deletion.userId } }),
    prisma.applePurchase.findMany({ where: { userId: deletion.userId }, select: { id: true, environment: true } }),
    prisma.appleTransaction.findMany({ where: { userId: deletion.userId }, select: { id: true, environment: true, appAccountToken: true } }),
  ]);

  const references: Array<{
    accountDeletionId: string;
    provider: "STRIPE" | "APPLE";
    recordKind:
      | "STRIPE_CUSTOMER"
      | "STRIPE_SUBSCRIPTION"
      | "STRIPE_CHECKOUT_SESSION"
      | "APPLE_BILLING_ACCOUNT"
      | "APPLE_PURCHASE"
      | "APPLE_TRANSACTION";
    sourceRecordId: string;
  }> = [];
  if (stripe) {
    if (stripe.stripeCustomerId) references.push({ accountDeletionId: deletion.id, provider: "STRIPE", recordKind: "STRIPE_CUSTOMER", sourceRecordId: stripe.id });
    if (stripe.stripeSubscriptionId) references.push({ accountDeletionId: deletion.id, provider: "STRIPE", recordKind: "STRIPE_SUBSCRIPTION", sourceRecordId: stripe.id });
    if (stripe.stripeLifetimeCheckoutSessionId) references.push({ accountDeletionId: deletion.id, provider: "STRIPE", recordKind: "STRIPE_CHECKOUT_SESSION", sourceRecordId: stripe.id });
  }
  if (billing) references.push({ accountDeletionId: deletion.id, provider: "APPLE", recordKind: "APPLE_BILLING_ACCOUNT", sourceRecordId: billing.id });
  references.push(...applePurchases.map(({ id }) => ({ accountDeletionId: deletion.id, provider: "APPLE" as const, recordKind: "APPLE_PURCHASE" as const, sourceRecordId: id })));
  references.push(...appleTransactions.map(({ id }) => ({ accountDeletionId: deletion.id, provider: "APPLE" as const, recordKind: "APPLE_TRANSACTION" as const, sourceRecordId: id })));

  if (references.length) await prisma.restrictedFinancialReference.createMany({ data: references, skipDuplicates: true });
  const appleTokens = new Set(appleTransactions.map(({ appAccountToken }) => appAccountToken));
  if (billing?.appAccountToken) appleTokens.add(billing.appAccountToken);
  if (appleTokens.size > 1) throw new Error("APPLE_MAPPING_OWNERSHIP_CONFLICT");
  const appAccountToken = [...appleTokens][0];
  if (appAccountToken) {
    const environments = new Set([
      ...applePurchases.map((item) => item.environment),
      ...appleTransactions.map((item) => item.environment),
    ]);
    // appAccountToken is an application identity across both Apple environments;
    // one opaque mapping is sufficient to route notifications to the tombstone.
    const environment = environments.has("SANDBOX") && !environments.has("PRODUCTION") ? "SANDBOX" : "PRODUCTION";
    const existingMapping = await prisma.deletedAppleAccountMapping.findUnique({
      where: { appAccountToken },
      select: { accountDeletionId: true },
    });
    if (existingMapping && existingMapping.accountDeletionId !== deletion.id) {
      throw new Error("APPLE_MAPPING_OWNERSHIP_CONFLICT");
    }
    await prisma.deletedAppleAccountMapping.upsert({
      where: { appAccountToken },
      create: { accountDeletionId: deletion.id, appAccountToken, environment },
      update: { environment },
    });
  }
}

async function ensureReviewTasks(deletion: ClaimedDeletion) {
  const [parks, foods, foodRevisions, exercises] = await Promise.all([
    prisma.park.findMany({
      where: {
        submittedById: deletion.userId,
        OR: [
          { submissionStatus: "APPROVED" },
          { photos: { some: { OR: [{ uploadedById: { not: deletion.userId } }, { uploadedById: null }] } } },
        ],
      },
      take: BATCH_SIZE,
      select: { id: true },
    }),
    prisma.food.findMany({ where: { createdByUserId: deletion.userId }, orderBy: { id: "asc" }, take: BATCH_SIZE, select: { id: true } }),
    prisma.foodRevision.findMany({
      where: { createdByUserId: deletion.userId },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true, foodId: true },
    }),
    prisma.exercise.findMany({
      where: {
        createdByUserId: deletion.userId,
        OR: [
          { workoutExercises: { some: { workout: { userId: { not: deletion.userId } } } } },
          { templateExercises: { some: { template: { userId: { not: deletion.userId } } } } },
          { personalRecords: { some: { userId: { not: deletion.userId } } } },
        ],
      },
      take: BATCH_SIZE,
      select: { id: true },
    }),
  ]);
  const foodIds = [...new Set([...foods.map(({ id }) => id), ...foodRevisions.map(({ foodId }) => foodId)])];
  const tasks = [
    ...parks.map(({ id }) => ({ accountDeletionId: deletion.id, resourceKind: "PARK" as const, resourceId: String(id), cleanupDeadline: deletion.cleanupDeadline })),
    ...foodIds.map((id) => ({ accountDeletionId: deletion.id, resourceKind: "FOOD" as const, resourceId: id, cleanupDeadline: deletion.cleanupDeadline })),
    ...foodRevisions.map(({ id }) => ({ accountDeletionId: deletion.id, resourceKind: "FOOD" as const, resourceId: `revision:${id}`, cleanupDeadline: deletion.cleanupDeadline })),
    ...exercises.map(({ id }) => ({ accountDeletionId: deletion.id, resourceKind: "EXERCISE" as const, resourceId: id, cleanupDeadline: deletion.cleanupDeadline })),
  ];
  if (tasks.length || foodIds.length) {
    await prisma.$transaction(async (tx) => {
      if (tasks.length) await tx.deletionCommunityReviewTask.createMany({ data: tasks, skipDuplicates: true });

      // Each bounded page is durably tasked and withheld before attribution is
      // cleared. Clearing creator IDs advances the next page without a cursor
      // that could skip rows after a restart.
      if (parks.length) {
        await tx.park.updateMany({ where: { id: { in: parks.map(({ id }) => id) } }, data: { submissionStatus: "PENDING" } });
      }
      if (foodIds.length) {
        await tx.food.updateMany({ where: { id: { in: foodIds } }, data: { contributionStatus: "PENDING" } });
        const ownedFoodIds = foods.map(({ id }) => id);
        if (ownedFoodIds.length) {
          await tx.food.updateMany({ where: { id: { in: ownedFoodIds }, createdByUserId: deletion.userId }, data: { createdByUserId: null } });
        }
        const revisionIds = foodRevisions.map(({ id }) => id);
        if (revisionIds.length) {
          await tx.foodRevision.updateMany({ where: { id: { in: revisionIds }, createdByUserId: deletion.userId }, data: { createdByUserId: null } });
        }
        await tx.foodSourceRecord.deleteMany({ where: { foodId: { in: foodIds }, source: "USER" } });
        // USER aliases are contribution text attached to the reviewed food.
        // They remain available to the admin review endpoint and are hidden
        // with the parent food until that task is resolved.
      }
    });
  }

  const [remainingFoodOwners, remainingRevisionOwners] = await Promise.all([
    prisma.food.count({ where: { createdByUserId: deletion.userId } }),
    prisma.foodRevision.count({ where: { createdByUserId: deletion.userId } }),
  ]);
  if (remainingFoodOwners === 0 && remainingRevisionOwners === 0) {
    await prisma.accountDeletion.updateMany({
      where: { id: deletion.id, status: "CLEANUP_PROCESSING", processingLeaseId: deletion.leaseId },
      data: { foodReviewScanComplete: true },
    });
  }

  // Shared exercise records retain their stable IDs for other users' histories,
  // but lose the creator and arbitrary media URLs. Private unused records are
  // deleted after the deleted user's workouts and routines are removed.
  for (const { id } of exercises) {
    const exercise = await prisma.exercise.findUnique({ where: { id }, select: { id: true, slug: true, name: true } });
    if (!exercise) continue;
    await prisma.exercise.update({
      where: { id },
      data: {
        createdByUserId: null,
        slug: `shared-deleted-${randomUUID()}`,
        name: "Shared exercise",
        thumbnailUrl: null,
        videoUrl: null,
      },
    });
    await prisma.deletionCommunityReviewTask.updateMany({
      where: { accountDeletionId: deletion.id, resourceKind: "EXERCISE", resourceId: id, status: "PENDING" },
      data: { status: "RESOLVED", completedAt: new Date() },
    });
  }
}

async function collectMediaKeys(userId: string) {
  const keys = new Set<string>();
  const [workoutPhotos, parkPhotos, editSubmissions, parks, user] = await Promise.all([
    prisma.workoutPhoto.findMany({ where: { userId }, take: BATCH_SIZE, select: { storageKey: true } }),
    prisma.parkPhoto.findMany({ where: { uploadedById: userId }, take: BATCH_SIZE, select: { url: true } }),
    prisma.parkEditSubmission.findMany({ where: { submittedById: userId }, take: BATCH_SIZE, select: { photoKeys: true, photoUrls: true } }),
    prisma.park.findMany({ where: { submittedById: userId }, take: BATCH_SIZE, select: { photoKey: true, photoUrl: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { image: true } }),
  ]);
  for (const row of workoutPhotos) if (normalizedObjectKey(row.storageKey)) keys.add(row.storageKey);
  for (const row of parkPhotos) {
    if (!row.url) continue;
    try {
      const key = getParkPhotoKeyFromUrl(row.url);
      if (key && isSafeParkPhotoObjectKey(key)) keys.add(key);
    } catch {
      throw new Error("R2_CONFIGURATION_REQUIRED");
    }
  }
  const ownerKeyPart = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  for (const submission of editSubmissions) {
    for (const key of submission.photoKeys) {
      if (
        isSafeParkPhotoObjectKey(key) &&
        (key.startsWith(`pending/parks/${ownerKeyPart}/`) || key.startsWith(`parks/${ownerKeyPart}/`))
      ) keys.add(key);
    }
    for (const url of submission.photoUrls) {
      try {
        const key = getParkPhotoKeyFromUrl(url);
        if (key && isSafeParkPhotoObjectKey(key)) keys.add(key);
      } catch {
        throw new Error("R2_CONFIGURATION_REQUIRED");
      }
    }
  }
  for (const park of parks) {
    const key = park.photoKey ?? (park.photoUrl ? (() => {
      try { return getParkPhotoKeyFromUrl(park.photoUrl); } catch { throw new Error("R2_CONFIGURATION_REQUIRED"); }
    })() : null);
    if (key && isSafeParkPhotoObjectKey(key)) keys.add(key);
  }
  if (user?.image) {
    try {
      const key = getParkPhotoKeyFromUrl(user.image);
      if (key) keys.add(key);
    } catch {
      // External OAuth avatars are unlinked by clearing User.image; the app
      // cannot delete objects owned by an external image host.
    }
  }
  return [...keys].slice(0, BATCH_SIZE);
}

async function enqueueMediaTasks(deletion: ClaimedDeletion) {
  const keys = await collectMediaKeys(deletion.userId);
  if (!keys.length) return;
  await prisma.deletionCommunityReviewTask.createMany({
    data: keys.map((resourceId) => ({
      accountDeletionId: deletion.id,
      resourceKind: "MEDIA" as const,
      resourceId,
      cleanupDeadline: deletion.cleanupDeadline,
    })),
    skipDuplicates: true,
  });
}

async function collectParkUrlReferences(tx: Prisma.TransactionClient, keys: string[], userId: string) {
  const referenced = new Set<string>();
  const uncertain = new Set<string>();
  const ownedReview = new Set<string>();
  if (!keys.length) return { referenced, uncertain, ownedReview };

  // Park.photoUrl has no object-key index and may contain old CDN URLs,
  // encoding, or query parameters. Read this narrow projection once per
  // claimed media batch, rather than scanning 27k parks once for every object.
  const [parks, parkPhotos, edits, users] = await Promise.all([
    tx.park.findMany({ where: { OR: [{ photoKey: { in: keys } }, { photoUrl: { not: null } }] }, select: { photoKey: true, photoUrl: true, submittedById: true } }),
    tx.parkPhoto.findMany({ where: { OR: [{ uploadedById: { not: userId } }, { uploadedById: null }] }, select: { url: true } }),
    tx.parkEditSubmission.findMany({ where: { submittedById: { not: userId }, photoUrls: { isEmpty: false } }, select: { photoUrls: true } }),
    tx.user.findMany({ where: { id: { not: userId }, image: { not: null } }, select: { image: true } }),
  ]);
  for (const park of parks) {
    if (park.photoKey && keys.includes(park.photoKey)) {
      if (park.submittedById === userId) ownedReview.add(park.photoKey);
      else referenced.add(park.photoKey);
    }
    if (!park.photoUrl) continue;
    try {
      const key = getParkPhotoKeyFromUrl(park.photoUrl);
      if (key && keys.includes(key)) {
        if (park.submittedById === userId) ownedReview.add(key);
        else referenced.add(key);
      }
    } catch {
      for (const key of keys) uncertain.add(key);
    }
  }
  const values = [
    ...parkPhotos.map(({ url }) => url),
    ...edits.flatMap(({ photoUrls }) => photoUrls),
    ...users.map(({ image }) => image),
  ];
  for (const value of values) {
    if (!value) continue;
    try {
      const key = getParkPhotoKeyFromUrl(value);
      if (key && keys.includes(key)) referenced.add(key);
    } catch {
      // An unparseable retained reference makes ownership uncertain. Preserve
      // the claimed objects and leave their tasks retryable for investigation.
      for (const key of keys) uncertain.add(key);
    }
  }
  return { referenced, uncertain, ownedReview };
}

async function objectReferencedByAnotherUser(
  tx: Prisma.TransactionClient,
  key: string,
  userId: string,
  parkUrlReferences: { referenced: Set<string>; uncertain: Set<string>; ownedReview: Set<string> },
) {
  if (parkUrlReferences.referenced.has(key) || parkUrlReferences.uncertain.has(key)) return true;
  const [workoutPhoto, park, edit, profile] = await Promise.all([
    tx.workoutPhoto.findFirst({ where: { storageKey: key, userId: { not: userId } }, select: { id: true } }),
    tx.park.findFirst({ where: { photoKey: key, OR: [{ submittedById: { not: userId } }, { submittedById: null }] }, select: { id: true } }),
    tx.parkEditSubmission.findFirst({ where: { submittedById: { not: userId }, photoKeys: { has: key } }, select: { id: true } }),
    tx.user.findFirst({ where: { id: { not: userId }, image: { endsWith: `/${key}` } }, select: { id: true } }),
  ]);
  return Boolean(workoutPhoto || park || edit || profile);
}

async function deleteMediaReferences(tx: Prisma.TransactionClient, key: string, userId: string) {
  await tx.workoutPhoto.deleteMany({ where: { storageKey: key, userId } });

  const ownedParkPhotos = await tx.parkPhoto.findMany({ where: { uploadedById: userId }, select: { id: true, url: true } });
  const ownedParkPhotoIds = ownedParkPhotos.flatMap((photo) => {
    try { return getParkPhotoKeyFromUrl(photo.url) === key ? [photo.id] : []; } catch { return []; }
  });
  if (ownedParkPhotoIds.length) await tx.parkPhoto.deleteMany({ where: { id: { in: ownedParkPhotoIds } } });

  const ownedParks = await tx.park.findMany({
    where: { submittedById: userId, OR: [{ photoKey: key }, { photoUrl: { not: null } }] },
    select: { id: true, photoKey: true, photoUrl: true },
  });
  for (const park of ownedParks) {
    let urlKey: string | null = null;
    try { urlKey = park.photoUrl ? getParkPhotoKeyFromUrl(park.photoUrl) : null; } catch { /* preserve malformed URL for review */ }
    if (park.photoKey !== key && urlKey !== key) continue;
    await tx.park.update({
      where: { id: park.id },
      data: {
        ...(park.photoKey === key ? { photoKey: null } : {}),
        ...(urlKey === key ? { photoUrl: null } : {}),
      },
    });
  }

  const edits = await tx.parkEditSubmission.findMany({
    where: { submittedById: userId },
    take: BATCH_SIZE,
    select: { id: true, photoKeys: true, photoUrls: true },
  });
  for (const edit of edits) {
    const nextKeys = edit.photoKeys.filter((value) => value !== key);
    const nextUrls = edit.photoUrls.filter((value) => {
      try { return getParkPhotoKeyFromUrl(value) !== key; } catch { return true; }
    });
    if (nextKeys.length !== edit.photoKeys.length || nextUrls.length !== edit.photoUrls.length) {
      await tx.parkEditSubmission.update({ where: { id: edit.id }, data: { photoKeys: { set: nextKeys }, photoUrls: { set: nextUrls } } });
    }
  }
  const ownedImage = await tx.user.findUnique({ where: { id: userId }, select: { image: true } });
  if (ownedImage?.image) {
    try {
      if (getParkPhotoKeyFromUrl(ownedImage.image) === key) await tx.user.update({ where: { id: userId }, data: { image: null } });
    } catch { /* external or malformed avatars are cleared by tombstoning */ }
  }
}

async function claimAndDeleteMedia(deletion: ClaimedDeletion, deps: WorkerDependencies) {
  await enqueueMediaTasks(deletion);
  const tasks = await prisma.deletionCommunityReviewTask.findMany({
    where: {
      accountDeletionId: deletion.id,
      resourceKind: "MEDIA",
      OR: [
        { status: { in: ["PENDING", "RETRY"] } },
        { status: "PROCESSING", leaseExpiresAt: { lte: deps.now() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: MEDIA_BATCH_SIZE,
    select: { id: true, resourceId: true },
  });
  const claimedTasks: Array<{ id: string; key: string | null; leaseId: string }> = [];
  for (const task of tasks) {
    await refreshLease(deletion, deps.now());
    const leaseId = randomUUID();
    const claimed = await prisma.deletionCommunityReviewTask.updateMany({
      where: {
        id: task.id,
        OR: [
          { status: { in: ["PENDING", "RETRY"] } },
          { status: "PROCESSING", leaseExpiresAt: { lte: deps.now() } },
        ],
      },
      data: {
        status: "PROCESSING",
        processingLeaseId: leaseId,
        leaseExpiresAt: new Date(deps.now().getTime() + LEASE_MS),
        attemptCount: { increment: 1 },
        lastAttemptAt: deps.now(),
        lastErrorCategory: null,
      },
    });
    if (!claimed.count) continue;
    claimedTasks.push({ id: task.id, key: normalizedObjectKey(task.resourceId), leaseId });
  }

  const validKeys = [...new Set(claimedTasks.flatMap(({ key }) => key ? [key] : []))].sort();
  const outcomes = new Map<string, "RESOLVED" | "PARK_REFERENCE_UNCERTAIN" | "PARK_REVIEW_PENDING" | "MEDIA_DELETE_FAILED" | "INVALID_MEDIA_KEY">();
  for (const item of claimedTasks) if (!item.key) outcomes.set(item.id, "INVALID_MEDIA_KEY");
  try {
    if (validKeys.length) {
      await prisma.$transaction(async (tx) => {
        // Advisory locks serialize overlapping cleanup workers for identical
        // object keys. Sorted acquisition avoids deadlocks for overlapping sets.
        for (const key of validKeys) {
          await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        }

        const parkUrlReferences = await collectParkUrlReferences(tx, validKeys, deletion.userId);
        const decisions = new Map<string, boolean>();
        for (const key of validKeys) {
          if (parkUrlReferences.uncertain.has(key) || parkUrlReferences.ownedReview.has(key)) continue;
          decisions.set(key, await objectReferencedByAnotherUser(tx, key, deletion.userId, parkUrlReferences));
        }

        // Delete only objects with a determinate, unshared reference state.
        // R2 deletion is idempotent; a transaction retry can safely repeat it.
        await Promise.all(validKeys.filter((key) => decisions.get(key) === false).map((key) =>
          isWorkoutPhotoKey(key) ? deps.deleteWorkoutObject(key) : deps.deleteParkObject(key)
        ));

        for (const item of claimedTasks) {
          if (!item.key) {
            outcomes.set(item.id, "INVALID_MEDIA_KEY");
          } else if (parkUrlReferences.uncertain.has(item.key)) {
            outcomes.set(item.id, "PARK_REFERENCE_UNCERTAIN");
          } else if (parkUrlReferences.ownedReview.has(item.key)) {
            outcomes.set(item.id, "PARK_REVIEW_PENDING");
          } else {
            await deleteMediaReferences(tx, item.key, deletion.userId);
            outcomes.set(item.id, "RESOLVED");
          }
        }
      }, { maxWait: 5_000, timeout: 30_000 });
    }
  } catch {
    for (const item of claimedTasks) outcomes.set(item.id, "MEDIA_DELETE_FAILED");
  }

  for (const task of claimedTasks) {
    const outcome = outcomes.get(task.id) ?? "MEDIA_DELETE_FAILED";
    await prisma.deletionCommunityReviewTask.updateMany({
      where: { id: task.id, status: "PROCESSING", processingLeaseId: task.leaseId },
      data: outcome === "RESOLVED"
        ? { status: "RESOLVED", completedAt: deps.now(), lastErrorCategory: null, processingLeaseId: null, leaseExpiresAt: null }
        : { status: "RETRY", lastErrorCategory: outcome, processingLeaseId: null, leaseExpiresAt: null },
    });
  }
}

type BatchDelegate = {
  findMany(args: object): Promise<Array<Record<string, unknown>>>;
  deleteMany(args: object): Promise<{ count: number }>;
};

async function deleteBatch(
  model: unknown,
  where: object,
  idFields: string[] = ["id"]
) {
  // Prisma exposes separately typed delegates; this narrow adapter is only
  // used for the shared bounded find/delete operation below.
  const delegate = model as BatchDelegate;
  const select = Object.fromEntries(idFields.map((field) => [field, true]));
  const rows = await delegate.findMany({ where, take: BATCH_SIZE, select });
  if (!rows.length) return 0;
  const selector = idFields.length === 1
    ? { [idFields[0]]: { in: rows.map((row: Record<string, unknown>) => row[idFields[0]]) } }
    : { OR: rows.map((row: Record<string, unknown>) => Object.fromEntries(idFields.map((field) => [field, row[field]]))) };
  const result = await delegate.deleteMany({ where: { AND: [where, selector] } });
  return result.count;
}

async function removePrivateRecords(deletion: ClaimedDeletion) {
  const userId = deletion.userId;
  let removed = 0;
  // Keep park edits until their object keys have been enqueued and processed.
  const editsWithoutMedia = await prisma.parkEditSubmission.findMany({
    where: { submittedById: userId, photoKeys: { isEmpty: true }, photoUrls: { isEmpty: true } },
    take: BATCH_SIZE,
    select: { id: true },
  });
  if (editsWithoutMedia.length) removed += await prisma.parkEditSubmission.deleteMany({ where: { id: { in: editsWithoutMedia.map(({ id }) => id) } } }).then((r) => r.count);
  const ownerKeyPart = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  const edits = await prisma.parkEditSubmission.findMany({
    where: { submittedById: userId },
    take: BATCH_SIZE,
    select: { id: true, photoKeys: true, photoUrls: true },
  });
  for (const edit of edits) {
    const safeKeys = edit.photoKeys.filter((key) => isSafeParkPhotoObjectKey(key) &&
      (key.startsWith(`pending/parks/${ownerKeyPart}/`) || key.startsWith(`parks/${ownerKeyPart}/`)));
    const safeUrls = edit.photoUrls.filter((url) => {
      try {
        const key = getParkPhotoKeyFromUrl(url);
        return Boolean(key && safeKeys.includes(key));
      } catch {
        return false;
      }
    });
    if (safeKeys.length !== edit.photoKeys.length || safeUrls.length !== edit.photoUrls.length) {
      await prisma.parkEditSubmission.update({ where: { id: edit.id }, data: { photoKeys: { set: safeKeys }, photoUrls: { set: safeUrls } } });
    }
  }
  const parkReviewTasks = await prisma.deletionCommunityReviewTask.findMany({
    where: { accountDeletionId: deletion.id, resourceKind: "PARK" },
    select: { resourceId: true },
  });
  const reviewedParkIds = parkReviewTasks.map(({ resourceId }) => Number(resourceId)).filter(Number.isSafeInteger);
  const parksToPurge = await prisma.park.findMany({
    where: { submittedById: userId, submissionStatus: { not: "APPROVED" } },
    take: BATCH_SIZE,
    select: { id: true },
  });
  const purgeIds = parksToPurge.map((park) => park.id).filter((id) => !reviewedParkIds.includes(id));
  if (purgeIds.length) {
    await prisma.park.updateMany({ where: { id: { in: purgeIds } }, data: { deletedAt: new Date() } });
    await prisma.park.deleteMany({ where: { id: { in: purgeIds }, photos: { none: {} } } });
  }
  const parksReadyToUnattribute = await prisma.park.findMany({
    where: { submittedById: userId, photoKey: null, photoUrl: null },
    take: BATCH_SIZE,
    select: { id: true },
  });
  if (parksReadyToUnattribute.length) {
    await prisma.park.updateMany({
      where: { id: { in: parksReadyToUnattribute.map(({ id }) => id) } },
      data: {
        submittedById: null,
        photoLocationVerifications: Prisma.DbNull,
        qrInstalledByLabel: null,
        qrCodeNote: null,
      },
    });
  }
  const parksWithoutManagedMedia = await prisma.park.findMany({
    where: { submittedById: userId },
    take: BATCH_SIZE,
    select: { id: true, photoKey: true, photoUrl: true },
  });
  for (const park of parksWithoutManagedMedia) {
    const key = park.photoKey ?? (park.photoUrl ? (() => {
      try { return getParkPhotoKeyFromUrl(park.photoUrl); } catch { return null; }
    })() : null);
    if (!key || !normalizedObjectKey(key)) {
      await prisma.park.update({ where: { id: park.id }, data: { photoKey: null, photoUrl: null } });
    }
  }

  // External photo URLs are removed from public application data. R2-backed
  // references remain until their durable deletion task removes the object.
  const mediaTasks = await prisma.deletionCommunityReviewTask.findMany({
    where: { accountDeletionId: deletion.id, resourceKind: "MEDIA" },
    select: { resourceId: true },
  });
  const managedParkPhotoUrls = mediaTasks.map(({ resourceId }) => {
    try { return getParkPhotoUrlFromKey(resourceId); } catch { return null; }
  }).filter((url): url is string => Boolean(url));
  await deleteBatch(prisma.parkPhoto, {
    uploadedById: userId,
    ...(managedParkPhotoUrls.length ? { url: { notIn: managedParkPhotoUrls } } : {}),
  });

  // Owned histories are removed in bounded parent batches; their child sets,
  // supersets, notifications, likes, records, and logs cascade by schema.
  removed += await deleteBatch(prisma.workoutTemplate, { userId });
  const workouts = await prisma.workout.findMany({ where: { userId, photos: { none: {} } }, take: BATCH_SIZE, select: { id: true } });
  if (workouts.length) {
    await deleteBatch(prisma.personalRecord, { userId });
    await prisma.workout.deleteMany({ where: { id: { in: workouts.map((workout) => workout.id) } } });
    removed += workouts.length;
  }
  removed += await deleteBatch(prisma.workoutComment, { userId });
  removed += await deleteBatch(prisma.workoutNotification, { OR: [{ userId }, { actorId: userId }] });
  removed += await deleteBatch(prisma.workoutLike, { userId }, ["workoutId", "userId"]);
  removed += await deleteBatch(prisma.userFollow, { OR: [{ followerId: userId }, { followingId: userId }] }, ["followerId", "followingId"]);
  removed += await deleteBatch(prisma.personalRecord, { userId });
  removed += await deleteBatch(prisma.rewardTransaction, { userId });
  removed += await deleteBatch(prisma.rewardRedemption, { userId });

  removed += await deleteBatch(prisma.nutritionEntrySnapshot, { userId });
  removed += await deleteBatch(prisma.nutritionSavedMeal, { userId });
  removed += await deleteBatch(prisma.nutritionSavedFood, { userId });
  removed += await deleteBatch(prisma.nutritionGoal, { userId });
  removed += await deleteBatch(prisma.userNutritionTargets, { userId });
  removed += await deleteBatch(prisma.nutritionAiUsage, { userId });
  removed += await deleteBatch(prisma.bodyMeasurementEntry, { userId });
  removed += await deleteBatch(prisma.userSupplementPlan, { userId });
  removed += await deleteBatch(prisma.userSupplementReminderSettings, { userId });
  removed += await deleteBatch(prisma.weeklyProgressReport, { userId });
  removed += await deleteBatch(prisma.userActivityEvent, { userId });

  // Delete private unused user-created exercises. Shared records were
  // anonymized by ensureReviewTasks and retain their IDs for other users.
  const customExercises = await prisma.exercise.findMany({ where: { createdByUserId: userId }, take: BATCH_SIZE, select: { id: true } });
  for (const { id } of customExercises) {
    const referenced = await prisma.exercise.findFirst({
      where: {
        id,
        OR: [
          { workoutExercises: { some: {} } },
          { templateExercises: { some: {} } },
          { personalRecords: { some: { userId: { not: userId } } } },
        ],
      },
      select: { id: true },
    });
    if (referenced) {
      await prisma.exercise.update({ where: { id }, data: { createdByUserId: null, name: "Shared exercise", slug: `shared-deleted-${randomUUID()}`, thumbnailUrl: null, videoUrl: null } });
    } else {
      await prisma.exercise.delete({ where: { id } });
    }
  }

  const accounts = await prisma.account.findMany({ where: { userId }, select: { provider: true, providerAccountId: true } });
  const appleIds = accounts.filter((account) => account.provider === "apple").map((account) => account.providerAccountId);
  if (appleIds.length) await deleteBatch(prisma.appleAccountEvent, { providerAccountId: { in: appleIds } });

  await deleteBatch(prisma.session, { userId }, ["sessionToken"]);
  await deleteBatch(prisma.nativeSession, { userId });
  await deleteBatch(prisma.nativeAuthAttempt, { userId });
  await deleteBatch(prisma.authActionToken, { userId });
  await deleteBatch(prisma.authLinkIntent, { userId });
  await deleteBatch(prisma.appleAuthAttempt, { userId });
  await deleteBatch(prisma.account, { userId }, ["provider", "providerAccountId"]);
  await prisma.passwordCredential.deleteMany({ where: { userId } });

  const appleAuth = await prisma.accountDeletion.findUnique({ where: { userId }, select: { appleRevocationStatus: true } });
  if (appleAuth?.appleRevocationStatus === "COMPLETED" || appleAuth?.appleRevocationStatus === "NOT_REQUIRED") {
    await prisma.appleAuthorization.deleteMany({ where: { userId } });
    // The restricted mapping replaces this user-linked routing record before
    // deletion, so later notifications cannot resurrect the account.
    await prisma.appleBillingAccount.deleteMany({ where: { userId } });
  }

  const originalEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (originalEmail?.email) {
    await deleteBatch(prisma.verificationToken, { identifier: originalEmail.email }, ["identifier", "token"]);
  }
  await prisma.user.updateMany({
    where: { id: userId, deletedAt: { not: null } },
    data: {
      name: null,
      email: null,
      emailVerified: null,
      image: null,
      username: null,
      bodyweightKg: null,
      measurementSystem: "METRIC",
      appleHealthWorkoutExportEnabled: false,
      appleHealthBodyweightImportEnabled: false,
      appleHealthBodyMeasurementExportEnabled: false,
      bodyFatSex: null,
      dateOfBirth: null,
      rewardPoints: 0,
      onboardingCompleted: false,
      trainingStyle: null,
      primaryGoal: null,
      rpeTrackingEnabled: false,
      weeklyWorkoutGoal: 3,
      weeklyCardioGoalMinutes: null,
      lastActiveAt: null,
    },
  });
  return removed;
}

async function countPersonalRows(userId: string) {
  const counts = await Promise.all([
    prisma.workout.count({ where: { userId } }),
    prisma.workoutPhoto.count({ where: { userId } }),
    prisma.parkEditSubmission.count({ where: { submittedById: userId } }),
    prisma.parkPhoto.count({ where: { uploadedById: userId } }),
    prisma.park.count({ where: { submittedById: userId, submissionStatus: { not: "APPROVED" } } }),
    prisma.exercise.count({ where: { createdByUserId: userId } }),
    prisma.food.count({ where: { createdByUserId: userId } }),
    prisma.foodRevision.count({ where: { createdByUserId: userId } }),
    prisma.bodyMeasurementEntry.count({ where: { userId } }),
    prisma.nutritionEntrySnapshot.count({ where: { userId } }),
    prisma.nutritionSavedMeal.count({ where: { userId } }),
    prisma.nutritionSavedFood.count({ where: { userId } }),
    prisma.nutritionGoal.count({ where: { userId } }),
    prisma.userNutritionTargets.count({ where: { userId } }),
    prisma.nutritionAiUsage.count({ where: { userId } }),
    prisma.userSupplementPlan.count({ where: { userId } }),
    prisma.weeklyProgressReport.count({ where: { userId } }),
    prisma.userActivityEvent.count({ where: { userId } }),
    prisma.rewardTransaction.count({ where: { userId } }),
    prisma.rewardRedemption.count({ where: { userId } }),
    prisma.userFollow.count({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
    prisma.workoutComment.count({ where: { userId } }),
    prisma.workoutLike.count({ where: { userId } }),
    prisma.workoutNotification.count({ where: { OR: [{ userId }, { actorId: userId }] } }),
    prisma.session.count({ where: { userId } }),
    prisma.nativeSession.count({ where: { userId } }),
    prisma.nativeAuthAttempt.count({ where: { userId } }),
    prisma.authActionToken.count({ where: { userId } }),
    prisma.authLinkIntent.count({ where: { userId } }),
    prisma.appleAuthAttempt.count({ where: { userId } }),
    prisma.account.count({ where: { userId } }),
    prisma.passwordCredential.count({ where: { userId } }),
    prisma.appleAuthorization.count({ where: { userId } }),
    prisma.parkEditSubmission.count({ where: { submittedById: userId } }),
    prisma.parkPhoto.count({ where: { uploadedById: userId } }),
    prisma.park.count({ where: { submittedById: userId } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function processOneDeletion(deletion: ClaimedDeletion, deps: WorkerDependencies) {
  const user = await prisma.user.findUnique({ where: { id: deletion.userId }, select: { deletedAt: true } });
  if (!user) throw new Error("DELETION_USER_MISSING");
  if (!user.deletedAt) throw new Error("DELETION_ACCOUNT_NOT_DEACTIVATED");

  await preserveFinancialReferences(deletion);
  await deps.revokeAppleAuthorization(deletion.userId, deps.now());
  await ensureReviewTasks(deletion);
  await claimAndDeleteMedia(deletion, deps);

  for (let pass = 0; pass < MAX_ACCOUNT_PASSES; pass += 1) {
    await refreshLease(deletion, deps.now());
    await removePrivateRecords(deletion);
    if (await countPersonalRows(deletion.userId) === 0) break;
  }

  const [remainingPersonal, openReviews, workflow] = await Promise.all([
    countPersonalRows(deletion.userId),
    prisma.deletionCommunityReviewTask.count({
      where: { accountDeletionId: deletion.id, status: { notIn: ["RESOLVED", "REMOVED_FROM_PUBLIC"] } },
    }),
    prisma.accountDeletion.findUnique({
      where: { id: deletion.id },
      select: { appleRevocationStatus: true },
    }),
  ]);
  const appleAuthorization = await prisma.appleAuthorization.count({ where: { userId: deletion.userId } });
  const complete = remainingPersonal === 0 && openReviews === 0 && appleAuthorization === 0 &&
    (workflow?.appleRevocationStatus === "COMPLETED" || workflow?.appleRevocationStatus === "NOT_REQUIRED");
  if (!complete) {
    await prisma.accountDeletion.updateMany({
      where: { id: deletion.id, status: "CLEANUP_PROCESSING", processingLeaseId: deletion.leaseId },
      data: {
        status: "CLEANUP_RETRY",
        lastErrorCategory: openReviews ? "COMMUNITY_REVIEW_PENDING" : appleAuthorization ? "APPLE_REVOCATION_PENDING" : "CLEANUP_BATCH_REMAINS",
        processingLeaseId: null,
        processingLeaseExpiresAt: null,
      },
    });
    return { completed: false, pendingReviews: openReviews, remainingPersonal };
  }

  const updated = await prisma.accountDeletion.updateMany({
    where: { id: deletion.id, status: "CLEANUP_PROCESSING", processingLeaseId: deletion.leaseId },
    data: {
      status: "CLEANUP_COMPLETED",
      completedAt: deps.now(),
      lastErrorCategory: null,
      processingLeaseId: null,
      processingLeaseExpiresAt: null,
    },
  });
  if (updated.count !== 1) throw new Error("DELETION_LEASE_LOST");
  return { completed: true, pendingReviews: 0, remainingPersonal: 0 };
}

function safeErrorCategory(error: unknown) {
  if (error instanceof Error && [
    "DELETION_USER_MISSING",
    "DELETION_ACCOUNT_NOT_DEACTIVATED",
    "DELETION_LEASE_LOST",
    "R2_CONFIGURATION_REQUIRED",
    "APPLE_MAPPING_OWNERSHIP_CONFLICT",
  ].includes(error.message)) return error.message;
  return "CLEANUP_PROCESSING_FAILED";
}

export async function processAccountDeletionBatch({
  limit = 5,
  accountDeletionId,
  dependencies = defaultDependencies,
}: {
  limit?: number;
  /** Restricts processing to one known row; used for isolated operational retries and tests. */
  accountDeletionId?: string;
  dependencies?: Partial<WorkerDependencies>;
} = {}) {
  const deps = { ...defaultDependencies, ...dependencies };
  const now = deps.now();
  const claimed = await claimDeletions(Math.max(1, Math.min(20, limit)), now, accountDeletionId);
  const summary = {
    claimed: claimed.length,
    completed: 0,
    retried: 0,
    pendingReviewTasks: 0,
    retryingDeletions: 0,
    overdueDeletions: 0,
    overdueReviewTasks: 0,
  };
  for (const deletion of claimed) {
    try {
      const result = await processOneDeletion(deletion, deps);
      if (result.completed) summary.completed += 1;
      else {
        summary.retried += 1;
        summary.pendingReviewTasks += result.pendingReviews;
      }
    } catch (error) {
      const category = safeErrorCategory(error);
      await prisma.accountDeletion.updateMany({
        where: { id: deletion.id, status: "CLEANUP_PROCESSING", processingLeaseId: deletion.leaseId },
        data: {
          status: "CLEANUP_RETRY",
          lastErrorCategory: category,
          processingLeaseId: null,
          processingLeaseExpiresAt: null,
        },
      });
      summary.retried += 1;
    }
  }
  const [retryingDeletions, overdueDeletions, overdueReviewTasks, pendingReviewTasks] = await Promise.all([
    prisma.accountDeletion.count({ where: { status: "CLEANUP_RETRY" } }),
    prisma.accountDeletion.count({ where: { status: { not: "CLEANUP_COMPLETED" }, cleanupDeadline: { lt: deps.now() } } }),
    prisma.deletionCommunityReviewTask.count({ where: { status: { notIn: ["RESOLVED", "REMOVED_FROM_PUBLIC"] }, cleanupDeadline: { lt: deps.now() } } }),
    prisma.deletionCommunityReviewTask.count({ where: { status: { notIn: ["RESOLVED", "REMOVED_FROM_PUBLIC"] } } }),
  ]);
  summary.retryingDeletions = retryingDeletions;
  summary.overdueDeletions = overdueDeletions;
  summary.overdueReviewTasks = overdueReviewTasks;
  summary.pendingReviewTasks = pendingReviewTasks;
  if (overdueDeletions || overdueReviewTasks) {
    console.error("[account-deletion] cleanup deadline exceeded", { overdueDeletions, overdueReviewTasks });
  }
  return summary;
}

export function accountDeletionWorkerAuthorized(request: Request, secret = process.env.ACCOUNT_DELETION_WORKER_SECRET) {
  if (!secret || secret.length < 32) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}
