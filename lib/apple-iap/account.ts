import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveStableAppleBillingAccount } from "@/lib/apple-iap/account-core";

export function getOrCreateAppleBillingAccount(userId: string) {
  return prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) throw new Error("BILLING_USER_DEACTIVATED");
    return resolveStableAppleBillingAccount({
      userId,
      findByUserId: (candidateUserId) =>
        tx.appleBillingAccount.findUnique({
          where: { userId: candidateUserId },
          select: { userId: true, appAccountToken: true },
        }),
      create: (candidateUserId, appAccountToken) =>
        tx.appleBillingAccount.create({
          data: { userId: candidateUserId, appAccountToken },
          select: { userId: true, appAccountToken: true },
        }),
    });
  });
}
