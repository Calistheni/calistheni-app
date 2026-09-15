import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { getUserEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { synchronizeOwnedAppleTransaction } from "@/lib/apple-iap/ownership";
import {
  appleOwnershipRepository,
  applyVerifiedAppleRenewalInfo,
} from "@/lib/apple-iap/persistence";
import { verifyAppleNotification } from "@/lib/apple-iap/verification";
import type { AppleVerifiedNotification } from "@/lib/apple-iap/verification-types";
import { getAppleNotificationAction } from "@/lib/apple-iap/notification-actions";

function safeProcessingError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.slice(0, 500);
}

async function recordVerifiedNotification(
  notification: AppleVerifiedNotification
) {
  try {
    return await prisma.appleServerNotification.create({
      data: {
        notificationUUID: notification.notificationUUID,
        environment: notification.environment,
        notificationType: notification.notificationType,
        subtype: notification.subtype,
        signedDate: notification.signedDate,
        payloadHash: notification.payloadHash,
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const existing = await prisma.appleServerNotification.findUnique({
      where: { notificationUUID: notification.notificationUUID },
    });
    if (!existing) throw error;
    if (existing.payloadHash !== notification.payloadHash) {
      throw new Error(
        "Apple notification UUID conflicts with an existing payload."
      );
    }
    return existing;
  }
}

export async function processVerifiedAppleNotification(
  notification: AppleVerifiedNotification
) {
  const record = await recordVerifiedNotification(notification);
  if (record.processingStatus === "PROCESSED") {
    return { duplicate: true, userId: null as string | null };
  }

  try {
    let userId: string | null = null;
    const action = getAppleNotificationAction(notification);
    // Apple's TEST notification verifies endpoint configuration only. It must
    // never create or alter an entitlement even if a future payload adds data.
    if (action === "SYNC_TRANSACTION" && notification.transaction) {
      const result = await synchronizeOwnedAppleTransaction({
        transaction: notification.transaction,
        renewalInfo: notification.renewalInfo,
        subscriptionStatus: notification.status,
        sourceSignedDate: notification.signedDate,
        repository: appleOwnershipRepository,
      });
      userId = result.userId;
    } else if (action === "SYNC_RENEWAL" && notification.renewalInfo) {
      const existing = await prisma.applePurchase.findUnique({
        where: {
          environment_originalTransactionId: {
            environment: notification.renewalInfo.environment,
            originalTransactionId:
              notification.renewalInfo.originalTransactionId,
          },
        },
        select: { userId: true },
      });
      const renewalResult = await applyVerifiedAppleRenewalInfo({
        renewalInfo: notification.renewalInfo,
        subscriptionStatus: notification.status,
        sourceSignedDate: notification.signedDate,
      });
      // A renewal-only notification cannot be applied safely before its
      // original transaction chain is known. Keep the notification retryable
      // instead of acknowledging and silently losing that state.
      if (!renewalResult.found) {
        throw new Error(
          "Verified Apple renewal has no synchronized purchase chain."
        );
      }
      userId = existing?.userId ?? null;
    }

    await prisma.appleServerNotification.update({
      where: { id: record.id },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        processingError: null,
      },
    });
    if (userId) await getUserEntitlements(userId);
    return { duplicate: false, userId };
  } catch (error) {
    await prisma.appleServerNotification.update({
      where: { id: record.id },
      data: {
        processingStatus: "FAILED",
        processingError: safeProcessingError(error),
      },
    });
    throw error;
  }
}

export async function processAppleNotificationJws(signedPayload: string) {
  const notification = await verifyAppleNotification(signedPayload);
  return {
    notification,
    result: await processVerifiedAppleNotification(notification),
  };
}
