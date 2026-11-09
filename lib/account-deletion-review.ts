import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type DeletionReviewAction = "KEEP_ANONYMIZED" | "REMOVE_FROM_PUBLIC";

export async function reviewDeletionCommunityTask(id: string, action: DeletionReviewAction) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; accountDeletionId: string; resourceKind: string; resourceId: string; status: string; deletionStatus: string; foodReviewScanComplete: boolean }>>`
      SELECT task."id", task."accountDeletionId", task."resourceKind", task."resourceId", task."status", deletion."status" AS "deletionStatus", deletion."foodReviewScanComplete"
      FROM "DeletionCommunityReviewTask" task
      JOIN "AccountDeletion" deletion ON deletion."id" = task."accountDeletionId"
      WHERE task."id" = ${id}
      FOR UPDATE OF task
    `;
    const task = rows[0];
    if (!task || !["PENDING", "RETRY"].includes(task.status)) throw new Error("REVIEW_TASK_NOT_OPEN");
    if (task.deletionStatus === "CLEANUP_COMPLETED") throw new Error("DELETION_ALREADY_COMPLETED");
    if (task.resourceKind === "FOOD" && !task.foodReviewScanComplete) throw new Error("FOOD_REVIEW_SCAN_INCOMPLETE");

    if (task.resourceKind === "PARK") {
      const parkId = Number(task.resourceId);
      if (!Number.isSafeInteger(parkId)) throw new Error("REVIEW_RESOURCE_MISSING");
      const park = await tx.park.findUnique({ where: { id: parkId }, select: { id: true } });
      if (!park) throw new Error("REVIEW_RESOURCE_MISSING");
      await tx.park.update({
        where: { id: parkId },
        data: action === "KEEP_ANONYMIZED"
          ? {
              submittedById: null,
              photoLocationVerifications: Prisma.DbNull,
              qrInstalledByLabel: null,
              qrCodeNote: null,
              submissionStatus: "APPROVED",
              deletedAt: null,
            }
          : {
              name: "Community park",
              title: null,
              address: null,
              submittedById: null,
              photoUrl: null,
              photoKey: null,
              photoLocationVerifications: Prisma.DbNull,
              qrInstalledByLabel: null,
              qrCodeNote: null,
              submissionStatus: "PENDING",
              deletedAt: new Date(),
            },
      });
    } else if (task.resourceKind === "FOOD") {
      const isRevisionTask = task.resourceId.startsWith("revision:");
      const revisionId = isRevisionTask ? task.resourceId.slice("revision:".length) : null;
      const revision = revisionId
        ? await tx.foodRevision.findUnique({ where: { id: revisionId }, select: { id: true, foodId: true } })
        : null;
      const foodId = revision?.foodId ?? task.resourceId;
      if (isRevisionTask && !revision) throw new Error("REVIEW_RESOURCE_MISSING");
      const food = await tx.food.findUnique({ where: { id: foodId }, select: { id: true, type: true } });
      if (!food) throw new Error("REVIEW_RESOURCE_MISSING");

      if (isRevisionTask) {
        await tx.foodRevision.update({
          where: { id: revisionId! },
          data: action === "KEEP_ANONYMIZED"
            ? { createdByUserId: null, imageUrl: null }
            : { name: "Removed contribution", brandName: null, barcode: null, imageUrl: null, createdByUserId: null },
        });
      } else if (action === "KEEP_ANONYMIZED") {
        await tx.food.update({
          where: { id: foodId },
          data: { createdByUserId: null, description: null, brandName: null, imageUrl: null, rejectionReason: null, reviewedAt: new Date() },
        });
      } else {
        await tx.food.update({
          where: { id: foodId },
          data: {
            name: "Removed contribution",
            normalizedName: `removed-contribution-${foodId}`,
            description: null,
            brandName: null,
            barcode: null,
            imageUrl: null,
            iconKey: null,
            createdByUserId: null,
            rejectionReason: null,
            reviewedAt: new Date(),
          },
        });
      }
    } else {
      throw new Error("REVIEW_KIND_UNSUPPORTED");
    }

    const nextStatus = action === "KEEP_ANONYMIZED" ? "RESOLVED" : "REMOVED_FROM_PUBLIC";
    const updated = await tx.deletionCommunityReviewTask.updateMany({
      where: { id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: nextStatus, completedAt: new Date(), lastErrorCategory: null, processingLeaseId: null, leaseExpiresAt: null },
    });
    if (updated.count !== 1) throw new Error("REVIEW_TASK_NOT_OPEN");

    if (task.resourceKind === "FOOD") {
      const isRevisionTask = task.resourceId.startsWith("revision:");
      const revisionId = isRevisionTask ? task.resourceId.slice("revision:".length) : null;
      const foodId = revisionId
        ? (await tx.foodRevision.findUnique({ where: { id: revisionId }, select: { foodId: true } }))?.foodId
        : task.resourceId;
      if (foodId) {
        const [states] = await tx.$queryRaw<Array<{ hasOpen: boolean; parentRemoved: boolean; revisionRemoved: boolean }>>`
          SELECT
            COALESCE(bool_or(task."status" NOT IN ('RESOLVED', 'REMOVED_FROM_PUBLIC')), false) AS "hasOpen",
            COALESCE(bool_or(task."resourceId" = ${foodId} AND task."status" = 'REMOVED_FROM_PUBLIC'), false) AS "parentRemoved",
            COALESCE(bool_or(task."resourceId" LIKE 'revision:%' AND task."status" = 'REMOVED_FROM_PUBLIC'), false) AS "revisionRemoved"
          FROM "DeletionCommunityReviewTask" task
          WHERE task."accountDeletionId" = ${task.accountDeletionId}
            AND task."resourceKind" = 'FOOD'
            AND (task."resourceId" = ${foodId} OR task."resourceId" IN (
              SELECT 'revision:' || revision."id" FROM "FoodRevision" revision WHERE revision."foodId" = ${foodId}
            ))
        `;
        if (!states?.hasOpen) {
          const food = await tx.food.findUnique({ where: { id: foodId }, select: { type: true } });
          if (food?.type === "USER_CREATED" && states?.parentRemoved) {
            await tx.food.update({ where: { id: foodId }, data: { contributionStatus: "REJECTED" } });
            await tx.foodAlias.deleteMany({ where: { foodId, source: "USER" } });
            await tx.foodRevision.updateMany({ where: { foodId, source: "USER" }, data: { name: "Removed contribution", brandName: null, barcode: null, imageUrl: null, createdByUserId: null } });
          } else if (food?.type === "USER_CREATED") {
            if (states?.revisionRemoved) {
              await tx.foodAlias.deleteMany({ where: { foodId, source: "USER" } });
            }
            await tx.food.update({ where: { id: foodId }, data: { contributionStatus: "APPROVED" } });
          } else {
            if (states?.revisionRemoved) {
              await tx.foodAlias.deleteMany({ where: { foodId, source: "USER" } });
              const previousProviderRevision = await tx.foodRevision.findFirst({
                where: { foodId, source: { not: "USER" } },
                orderBy: { revisionNumber: "desc" },
                select: { id: true },
              });
              await tx.food.update({ where: { id: foodId }, data: { currentRevisionId: previousProviderRevision?.id ?? null, contributionStatus: null } });
            } else {
              await tx.food.update({ where: { id: foodId }, data: { contributionStatus: null } });
            }
          }
        }
      }
    }
    return nextStatus;
  });
}
