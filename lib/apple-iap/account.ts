import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveStableAppleBillingAccount } from "@/lib/apple-iap/account-core";

export function getOrCreateAppleBillingAccount(userId: string) {
  return resolveStableAppleBillingAccount({
    userId,
    findByUserId: (candidateUserId) =>
      prisma.appleBillingAccount.findUnique({
        where: { userId: candidateUserId },
        select: { userId: true, appAccountToken: true },
      }),
    create: (candidateUserId, appAccountToken) =>
      prisma.appleBillingAccount.create({
        data: { userId: candidateUserId, appAccountToken },
        select: { userId: true, appAccountToken: true },
      }),
  });
}
