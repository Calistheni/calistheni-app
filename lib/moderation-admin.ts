import "server-only";

import { ModerationActionType, ModerationReportStatus, ModerationReportTarget } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getAdminModerationReports() {
  const reports = await prisma.moderationReport.findMany({
    // PostgreSQL preserves the enum order (OPEN first); oldest open reports
    // are reviewed before newer work so the bounded queue cannot starve them.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      targetOwnerId: true,
      targetLabel: true,
      targetExcerpt: true,
      reason: true,
      explanation: true,
      status: true,
      createdAt: true,
      actions: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, actorLabel: true, note: true, createdAt: true } },
    },
  });
  return reports.map((report) => ({
    ...report,
    createdAt: report.createdAt.toISOString(),
    actions: report.actions.map((action) => ({ ...action, createdAt: action.createdAt.toISOString() })),
  }));
}
export async function applyModerationAction({ reportId, action, actorLabel, note }: { reportId: string; action: ModerationActionType; actorLabel: string; note?: string }) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.moderationReport.findUnique({ where: { id: reportId } });
    if (!report) return { state: "NOT_FOUND" as const };
    const cleanNote = note?.trim() || null;
    let affected = 1;

    if (action === ModerationActionType.HIDE_CONTENT || action === ModerationActionType.RESTORE_CONTENT) {
      // Run against the transaction client so the audit action and visibility change commit together.
      const hidden = action === ModerationActionType.HIDE_CONTENT;
      const now = hidden ? new Date() : null;
      if (report.targetType === ModerationReportTarget.WORKOUT) {
        const id = Number(report.targetId);
        affected = Number.isSafeInteger(id) ? (await tx.workout.updateMany({ where: { id }, data: { moderationHiddenAt: now, moderationReason: hidden ? cleanNote ?? report.reason : null } })).count : 0;
      } else if (report.targetType === ModerationReportTarget.COMMENT) {
        affected = (await tx.workoutComment.updateMany({ where: { id: report.targetId }, data: { moderationHiddenAt: now, moderationReason: hidden ? cleanNote ?? report.reason : null } })).count;
      } else if (report.targetType === ModerationReportTarget.PARK_PHOTO) {
        const id = Number(report.targetId);
        affected = Number.isSafeInteger(id) ? (await tx.parkPhoto.updateMany({ where: { id }, data: { hiddenAt: now } })).count : 0;
      } else if (report.targetType === ModerationReportTarget.PARK) {
        const id = Number(report.targetId);
        affected = Number.isSafeInteger(id) ? (await tx.park.updateMany({ where: { id }, data: { deletedAt: now } })).count : 0;
      } else {
        affected = 0;
      }
    } else if (action === ModerationActionType.RESTRICT_USER || action === ModerationActionType.UNRESTRICT_USER) {
      const userId = report.targetType === ModerationReportTarget.USER ? report.targetId : report.targetOwnerId;
      affected = userId ? (await tx.user.updateMany({ where: { id: userId, deletedAt: null }, data: { communityRestrictedAt: action === ModerationActionType.RESTRICT_USER ? new Date() : null, communityRestrictionReason: action === ModerationActionType.RESTRICT_USER ? cleanNote ?? report.reason : null } })).count : 0;
      if (affected && action === ModerationActionType.RESTRICT_USER && userId) {
        await tx.userFollow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      }
    }

    const isReportOnlyAction =
      action === ModerationActionType.RESOLVE_REPORT ||
      action === ModerationActionType.DISMISS_REPORT;
    if (!affected && !isReportOnlyAction) return { state: "TARGET_NOT_FOUND" as const };

    const status = action === ModerationActionType.DISMISS_REPORT
      ? ModerationReportStatus.DISMISSED
      : ModerationReportStatus.RESOLVED;
    await tx.moderationReport.update({ where: { id: report.id }, data: { status, reviewedAt: new Date(), reviewedBy: actorLabel, resolutionNote: cleanNote } });
    await tx.moderationAction.create({ data: { reportId: report.id, action, actorLabel, targetType: report.targetType, targetId: report.targetId, note: cleanNote } });
    return { state: "UPDATED" as const, status };
  });
}
