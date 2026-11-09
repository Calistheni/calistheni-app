import "server-only";

import { prisma } from "@/lib/prisma";

type VerifiedAppleAccountEvent = {
  jti: string;
  type: string;
  providerAccountId: string;
  email: string | null;
  privateRelay: boolean | null;
  eventTime: Date;
};

export async function applyVerifiedAppleAccountEvent(event: VerifiedAppleAccountEvent) {
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { provider_providerAccountId: { provider: "apple", providerAccountId: event.providerAccountId } },
      select: { userId: true },
    });
    // A deletion removes the provider link immediately. Notifications for an
    // unlinked/deleted Apple identity have no account-side effect and must not
    // be retained with their subject or email in the event log.
    if (!account) return;
    const activeOwner = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${account.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeOwner.length) return;
    const authorization = await tx.appleAuthorization.findUnique({
      where: { userId: account.userId },
      select: { updatedAt: true },
    });
    // Apple notifications can arrive after the same subject has authorized a
    // newly registered account. Do not let an older event revoke that newer
    // authorization or its sessions.
    if (authorization && event.eventTime < authorization.updatedAt) return;
    await tx.appleAccountEvent.create({ data: event });
    if (event.type === "consent-revoked" || event.type === "account-deleted") {
      await tx.appleAuthorization.updateMany({
        where: { userId: account.userId },
        data: { revokedAt: event.eventTime, revocationPendingAt: null },
      });
      await tx.session.deleteMany({
        where: { userId: account.userId, authProvider: "apple" },
      });
    } else {
      await tx.appleAuthorization.updateMany({
        where: { userId: account.userId },
        data: { emailForwardingEnabled: event.type === "email-enabled" },
      });
    }
  });
}
