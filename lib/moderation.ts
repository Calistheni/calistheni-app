import "server-only";

import { Prisma, type ModerationReportTarget } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DAILY_REPORT_LIMIT = 10;

export function communityUserWhereForViewer(viewerId: string) {
  return {
    deletedAt: null,
    communityRestrictedAt: null,
    blocksInitiated: { none: { blockedId: viewerId } },
    blocksReceived: { none: { blockerId: viewerId } },
  } satisfies Prisma.UserWhereInput;
}
export async function usersBlockEachOther(firstUserId: string, secondUserId: string) {
  if (firstUserId === secondUserId) return false;
  return Boolean(await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: firstUserId, blockedId: secondUserId },
        { blockerId: secondUserId, blockedId: firstUserId },
      ],
    },
    select: { blockerId: true },
  }));
}

export async function canParticipateInCommunity(userId: string) {
  return Boolean(await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, communityRestrictedAt: null },
    select: { id: true },
  }));
}

type ReportTarget = {
  targetOwnerId: string | null;
  targetLabel: string;
  targetExcerpt: string | null;
};

async function resolveReportTarget(
  reporterId: string,
  targetType: ModerationReportTarget,
  targetId: string
): Promise<ReportTarget | null> {
  if (targetType === "USER") {
    const user = await prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, name: true, username: true },
    });
    if (!user || user.id === reporterId) return null;
    return {
      targetOwnerId: user.id,
      targetLabel: user.name ?? user.username ?? "Calistheni athlete",
      targetExcerpt: user.username ? `@${user.username}` : null,
    };
  }

  if (targetType === "WORKOUT") {
    const workoutId = Number(targetId);
    if (!Number.isSafeInteger(workoutId) || workoutId <= 0) return null;
    const workout = await prisma.workout.findFirst({
      where: {
        id: workoutId,
        visibility: "PUBLIC",
        completedAt: { not: null },
        moderationHiddenAt: null,
        user: { is: { deletedAt: null } },
      },
      select: { userId: true, title: true, notes: true },
    });
    if (!workout || workout.userId === reporterId) return null;
    return {
      targetOwnerId: workout.userId,
      targetLabel: workout.title ?? "Public workout",
      targetExcerpt: workout.notes?.slice(0, 500) ?? null,
    };
  }

  if (targetType === "COMMENT") {
    const comment = await prisma.workoutComment.findFirst({
      where: {
        id: targetId,
        moderationHiddenAt: null,
        workout: { visibility: "PUBLIC", completedAt: { not: null }, moderationHiddenAt: null },
        user: { is: { deletedAt: null } },
      },
      select: { userId: true, content: true },
    });
    if (!comment || comment.userId === reporterId) return null;
    return {
      targetOwnerId: comment.userId,
      targetLabel: "Workout comment",
      targetExcerpt: comment.content.slice(0, 500),
    };
  }

  if (targetType === "PARK") {
    const parkId = Number(targetId);
    if (!Number.isSafeInteger(parkId) || parkId <= 0) return null;
    const park = await prisma.park.findFirst({
      where: { id: parkId, deletedAt: null, submissionStatus: "APPROVED" },
      select: { name: true, submittedById: true, address: true },
    });
    if (!park) return null;
    return { targetOwnerId: park.submittedById, targetLabel: park.name, targetExcerpt: park.address };
  }

  const photoId = Number(targetId);
  if (!Number.isSafeInteger(photoId) || photoId <= 0) return null;
  const photo = await prisma.parkPhoto.findFirst({
    where: { id: photoId, hiddenAt: null, park: { deletedAt: null, submissionStatus: "APPROVED" } },
    select: { uploadedById: true, park: { select: { name: true } } },
  });
  return photo
    ? { targetOwnerId: photo.uploadedById, targetLabel: `Photo at ${photo.park.name}`, targetExcerpt: null }
    : null;
}

export async function createModerationReport({
  reporterId,
  targetType,
  targetId,
  reason,
  explanation,
}: {
  reporterId: string;
  targetType: ModerationReportTarget;
  targetId: string;
  reason: "HARASSMENT" | "HATE_SPEECH" | "SEXUAL_CONTENT" | "VIOLENCE" | "SPAM" | "PRIVACY" | "DANGEROUS_ACTIVITY" | "OTHER";
  explanation?: string;
}) {
  const target = await resolveReportTarget(reporterId, targetType, targetId);
  if (!target) return { state: "TARGET_NOT_FOUND" as const };

  try {
    const report = await prisma.$transaction(async (tx) => {
      // Serialize report intake per reporter so parallel requests cannot race
      // past the daily abuse limit with different targets.
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${reporterId}, 0))`;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await tx.moderationReport.count({
        where: { reporterId, createdAt: { gte: since } },
      });
      if (recentCount >= DAILY_REPORT_LIMIT) return null;
      return tx.moderationReport.create({
        data: {
          reporterId,
          targetType,
          targetId,
          reason,
          explanation: explanation?.trim() || null,
          ...target,
        },
        select: { id: true },
      });
    });
    if (!report) return { state: "RATE_LIMITED" as const };
    return { state: "CREATED" as const, reportId: report.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { state: "DUPLICATE" as const };
    }
    throw error;
  }
}
