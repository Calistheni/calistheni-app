import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { revokeStoredAppleAuthorization } from "@/lib/auth/apple";

const CLEANUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type AccountDeactivationResult =
  | { state: "DEACTIVATED"; cleanupDeadline: Date }
  | { state: "ALREADY_DEACTIVATED"; cleanupDeadline: Date }
  | { state: "USER_NOT_FOUND" }
  | { state: "INCONSISTENT_STATE" };

/**
 * Deactivate one canonical user and invalidate all sessions and temporary
 * credentials atomically. Row locking serializes this operation with auth
 * callbacks that create sessions or link providers.
 */
export function deactivateAccountForDeletion(userId: string, now = new Date()) {
  return prisma.$transaction(async (tx): Promise<AccountDeactivationResult> => {
    const rows = await tx.$queryRaw<Array<{ id: string; deletedAt: Date | null; email: string | null }>>`
      SELECT "id", "deletedAt", "email" FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    const user = rows[0];
    if (!user) return { state: "USER_NOT_FOUND" };

    const existing = await tx.accountDeletion.findUnique({
      where: { userId },
      select: { status: true, cleanupDeadline: true },
    });
    if (user.deletedAt) {
      return existing
        ? { state: "ALREADY_DEACTIVATED", cleanupDeadline: existing.cleanupDeadline }
        : { state: "INCONSISTENT_STATE" };
    }
    if (existing) {
      // A workflow row without deactivation is not a valid state. Fail closed
      // rather than silently changing or reviving its lifecycle.
      return { state: "INCONSISTENT_STATE" };
    }

    const cleanupDeadline = new Date(now.getTime() + CLEANUP_WINDOW_MS);
    const appleAuthorization = await tx.appleAuthorization.findUnique({
      where: { userId },
      select: { revokedAt: true },
    });
    const appleAccounts = await tx.account.findMany({
      where: { userId, provider: "apple" },
      select: { providerAccountId: true },
    });

    const deactivated = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      // Release reusable identity fields at deactivation, rather than waiting
      // for the background cleanup window. The tombstone stays permanently
      // deleted and receives a new ID if the person registers again.
      data: {
        deletedAt: now,
        email: null,
        emailVerified: null,
        name: null,
        image: null,
        username: null,
      },
    });
    if (deactivated.count !== 1) return { state: "INCONSISTENT_STATE" };

    await tx.accountDeletion.create({
      data: {
        userId,
        status: "DEACTIVATED",
        requestedAt: now,
        deactivatedAt: now,
        cleanupDeadline,
        appleRevocationStatus: appleAuthorization
          ? appleAuthorization.revokedAt
            ? "COMPLETED"
            : "PENDING"
          : "NOT_REQUIRED",
      },
    });
    if (appleAuthorization) {
      await tx.appleAuthorization.update({
        where: { userId },
        // Revocation uses the encrypted refresh token, client ID, and user ID;
        // the Apple subject is no longer needed once the provider link is
        // removed. Scrub it now to free the unique subject for a fresh account.
        data: {
          providerAccountId: `deleted-${randomUUID()}`,
          ...(appleAuthorization.revokedAt ? {} : { revocationPendingAt: now }),
        },
      });
    }

    await tx.account.deleteMany({ where: { userId } });
    await tx.passwordCredential.deleteMany({ where: { userId } });
    if (appleAccounts.length) {
      await tx.appleAccountEvent.deleteMany({
        where: { providerAccountId: { in: appleAccounts.map(({ providerAccountId }) => providerAccountId) } },
      });
    }
    if (user.email) {
      await tx.verificationToken.deleteMany({
        where: { identifier: { equals: user.email, mode: "insensitive" } },
      });
    }

    await Promise.all([
      tx.session.deleteMany({ where: { userId } }),
      tx.nativeSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      tx.authActionToken.deleteMany({ where: { userId } }),
      tx.authEmailDelivery.deleteMany({ where: { actionToken: { userId } } }),
      tx.authLinkIntent.deleteMany({ where: { userId } }),
      tx.appleAuthAttempt.deleteMany({ where: { userId } }),
      tx.nativeAuthAttempt.deleteMany({ where: { userId } }),
    ]);

    return { state: "DEACTIVATED", cleanupDeadline };
  });
}

/** Attempt Apple Sign-In revocation after atomic deactivation; failure is durable and retryable. */
export async function attemptAppleAuthorizationRevocation(userId: string, now = new Date()) {
  const deletion = await prisma.accountDeletion.findUnique({
    where: { userId },
    select: { id: true, appleRevocationStatus: true },
  });
  if (
    !deletion ||
    (!(["PENDING", "RETRY"].includes(deletion.appleRevocationStatus)) &&
      deletion.appleRevocationStatus !== "PROCESSING")
  ) {
    return false;
  }

  const claimed = await prisma.accountDeletion.updateMany({
    where: {
      id: deletion.id,
      OR: [
        { appleRevocationStatus: { in: ["PENDING", "RETRY"] } },
        {
          appleRevocationStatus: "PROCESSING",
          appleRevocationLastAttemptAt: {
            lt: new Date(now.getTime() - 15 * 60 * 1000),
          },
        },
      ],
    },
    data: {
      appleRevocationStatus: "PROCESSING",
      appleRevocationAttemptCount: { increment: 1 },
      appleRevocationLastAttemptAt: now,
      appleRevocationErrorCategory: null,
    },
  });
  if (claimed.count !== 1) return false;

  try {
    await revokeStoredAppleAuthorization(userId);
    await prisma.accountDeletion.updateMany({
      where: { id: deletion.id, appleRevocationStatus: "PROCESSING" },
      data: {
        appleRevocationStatus: "COMPLETED",
        appleRevocationErrorCategory: null,
      },
    });
  } catch {
    await prisma.accountDeletion.updateMany({
      where: { id: deletion.id, appleRevocationStatus: "PROCESSING" },
      data: {
        appleRevocationStatus: "RETRY",
        appleRevocationErrorCategory: "APPLE_REVOCATION_FAILED",
      },
    });
  }
  return true;
}
