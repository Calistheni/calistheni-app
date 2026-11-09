import "server-only";

import { randomUUID } from "node:crypto";
import { decryptAuthToken } from "@/lib/auth/security";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/auth/email-provider";
import {
  AUTH_EMAIL_MAX_ATTEMPTS,
  authEmailFailure,
  authEmailQueueHealth,
  authEmailRetryDelayMs,
  isAuthEmailWorkerAuthorized,
  isAuthEmailActionUsable,
} from "@/lib/auth/email-outbox-policy";

const CLAIM_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;

type EmailPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";
type SendAuthEmail = (purpose: EmailPurpose, email: string, token: string) => Promise<void>;

const sendByPurpose: SendAuthEmail = (purpose, email, token) =>
  purpose === "EMAIL_VERIFICATION"
    ? sendVerificationEmail(email, token)
    : sendPasswordResetEmail(email, token);

export function getAuthEmailBatchLimit(value = process.env.AUTH_EMAIL_BATCH_LIMIT) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(MAX_BATCH_SIZE, Math.max(1, parsed)) : DEFAULT_BATCH_SIZE;
}

export function authEmailWorkerAuthorized(
  request: Request,
  secrets = [process.env.AUTH_EMAIL_WORKER_SECRET, process.env.CRON_SECRET]
) {
  return isAuthEmailWorkerAuthorized(request.headers.get("authorization"), secrets);
}

type ClaimedDelivery = { id: string; attempts: number };

async function claimDueDeliveries(limit: number, deliveryId?: string) {
  const leaseId = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
  return prisma.$transaction(async (tx) => {
    const rows = deliveryId
      ? await tx.$queryRaw<ClaimedDelivery[]>`
          SELECT "id", "attempts" FROM "AuthEmailDelivery"
          WHERE "id" = ${deliveryId}
            AND "deliveredAt" IS NULL
            AND "permanentlyFailedAt" IS NULL
            AND "nextAttemptAt" <= ${now}
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${now})
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `
      : await tx.$queryRaw<ClaimedDelivery[]>`
          SELECT "id", "attempts" FROM "AuthEmailDelivery"
          WHERE "deliveredAt" IS NULL
            AND "permanentlyFailedAt" IS NULL
            AND "nextAttemptAt" <= ${now}
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${now})
          ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;
    if (!rows.length) return { leaseId, rows };
    await tx.authEmailDelivery.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, deliveredAt: null, permanentlyFailedAt: null },
      data: {
        leaseId,
        leaseExpiresAt,
        lastAttemptAt: now,
        attempts: { increment: 1 },
      },
    });
    return { leaseId, rows };
  });
}

async function processClaimedDelivery(
  id: string,
  leaseId: string,
  attempts: number,
  now: () => Date,
  send: SendAuthEmail
) {
  const delivery = await prisma.authEmailDelivery.findUnique({
    where: { id },
    include: { actionToken: { include: { user: { select: { deletedAt: true } } } } },
  });
  if (!delivery || delivery.leaseId !== leaseId) return "skipped" as const;

  const usable = isAuthEmailActionUsable({
    deliveredAt: delivery.deliveredAt,
    permanentlyFailedAt: delivery.permanentlyFailedAt,
    consumedAt: delivery.actionToken.consumedAt,
    expiresAt: delivery.actionToken.expiresAt,
    deletedAt: delivery.actionToken.user.deletedAt,
    now: now(),
  });
  if (!usable) {
    await prisma.authEmailDelivery.updateMany({
      where: { id, leaseId, deliveredAt: null, permanentlyFailedAt: null },
      data: {
        permanentlyFailedAt: now(),
        lastErrorCategory: delivery.actionToken.user.deletedAt ? "ACCOUNT_DELETED" : "ACTION_INVALIDATED",
        lastError: null,
        leaseId: null,
        leaseExpiresAt: null,
      },
    });
    return "skipped" as const;
  }

  let token: string;
  try {
    token = decryptAuthToken({
      ciphertext: delivery.tokenCiphertext,
      iv: delivery.tokenIv,
      tag: delivery.tokenTag,
      keyId: delivery.encryptionKeyId,
    });
  } catch {
    return recordFailure({ id, leaseId, attempts, now: now(), retryable: true, category: "TOKEN_ENCRYPTION" });
  }

  try {
    // Revalidate immediately before making the external request. Tokens are
    // never revived and invalid/deleted actions are never put back in the queue.
    const fresh = await prisma.authActionToken.findUnique({
      where: { id: delivery.actionTokenId },
      select: { consumedAt: true, expiresAt: true, user: { select: { deletedAt: true } } },
    });
    if (!fresh || fresh.consumedAt || fresh.expiresAt <= now() || fresh.user.deletedAt) {
      await prisma.authEmailDelivery.updateMany({
        where: { id, leaseId, deliveredAt: null, permanentlyFailedAt: null },
        data: {
          permanentlyFailedAt: now(),
          lastErrorCategory: fresh?.user.deletedAt ? "ACCOUNT_DELETED" : "ACTION_INVALIDATED",
          lastError: null,
          leaseId: null,
          leaseExpiresAt: null,
        },
      });
      return "skipped" as const;
    }
    await send(delivery.purpose, delivery.emailNormalized, token);
    const updated = await prisma.authEmailDelivery.updateMany({
      where: { id, leaseId, deliveredAt: null, permanentlyFailedAt: null },
      data: {
        deliveredAt: now(),
        lastErrorCategory: null,
        lastError: null,
        leaseId: null,
        leaseExpiresAt: null,
      },
    });
    return updated.count ? "sent" as const : "skipped" as const;
  } catch (error) {
    const failure = authEmailFailure(error);
    return recordFailure({ id, leaseId, attempts, now: now(), ...failure });
  }
}

async function recordFailure({
  id,
  leaseId,
  attempts,
  now,
  retryable,
  category,
}: {
  id: string;
  leaseId: string;
  attempts: number;
  now: Date;
  retryable: boolean;
  category: string;
}) {
  const terminal = !retryable || attempts >= AUTH_EMAIL_MAX_ATTEMPTS;
  const updated = await prisma.authEmailDelivery.updateMany({
    where: { id, leaseId, deliveredAt: null, permanentlyFailedAt: null },
    data: {
      permanentlyFailedAt: terminal ? now : null,
      nextAttemptAt: terminal ? undefined : new Date(now.getTime() + authEmailRetryDelayMs(attempts)),
      lastErrorCategory: category,
      // Keep only a safe category; provider response bodies and addresses are not stored.
      lastError: null,
      leaseId: null,
      leaseExpiresAt: null,
    },
  });
  if (!updated.count) return "skipped" as const;
  return terminal ? "permanentlyFailed" as const : "retried" as const;
}

export async function processAuthEmailOutboxBatch({
  limit = DEFAULT_BATCH_SIZE,
  deliveryId,
  now = () => new Date(),
  send = sendByPurpose,
}: {
  limit?: number;
  deliveryId?: string;
  now?: () => Date;
  send?: SendAuthEmail;
} = {}) {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(limit)))
    : DEFAULT_BATCH_SIZE;
  const claimed = await claimDueDeliveries(safeLimit, deliveryId);
  const summary = { claimed: claimed.rows.length, sent: 0, retried: 0, permanentlyFailed: 0, skipped: 0 };
  for (const row of claimed.rows) {
    const outcome = await processClaimedDelivery(row.id, claimed.leaseId, row.attempts + 1, now, send);
    summary[outcome] += 1;
  }
  return summary;
}

export async function getAuthEmailOutboxStatus(now = new Date()) {
  const [pending, permanentlyFailed, retrying, oldest, activeLeases, expiredLeases] = await Promise.all([
    prisma.authEmailDelivery.count({ where: { deliveredAt: null, permanentlyFailedAt: null } }),
    prisma.authEmailDelivery.count({ where: { deliveredAt: null, permanentlyFailedAt: { not: null } } }),
    prisma.authEmailDelivery.count({ where: { deliveredAt: null, permanentlyFailedAt: null, attempts: { gt: 0 } } }),
    prisma.authEmailDelivery.findFirst({
      where: { deliveredAt: null, permanentlyFailedAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.authEmailDelivery.count({ where: { deliveredAt: null, permanentlyFailedAt: null, leaseExpiresAt: { gt: now } } }),
    prisma.authEmailDelivery.count({ where: { deliveredAt: null, permanentlyFailedAt: null, leaseExpiresAt: { lte: now } } }),
  ]);
  const oldestPendingAgeSeconds = oldest ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000)) : null;
  const health = authEmailQueueHealth({ permanentlyFailed, expiredLeases, oldestPendingAgeSeconds });
  return {
    health,
    pending,
    retrying,
    permanentlyFailed,
    activeLeases,
    expiredLeases,
    oldestPendingAt: oldest?.createdAt.toISOString() ?? null,
    oldestPendingAgeSeconds,
  };
}
