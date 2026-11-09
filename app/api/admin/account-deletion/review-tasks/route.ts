import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const now = new Date();
  const approachingDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const cursor = new URL(request.url).searchParams.get("cursor");
  const [tasks, pendingDeletions, activeCleanups, retryRequired, failedDeletionOperations, failedReviewOperations, failedMediaCleanup, pendingAppleRevocations, failedAppleRevocations, approachingDeadlines, overdueDeletions, outstandingReviewTasks, oldestPendingDeletion] = await Promise.all([
    prisma.deletionCommunityReviewTask.findMany({
    where: {
      OR: [
        { resourceKind: "PARK", status: { in: ["PENDING", "RETRY"] } },
        { resourceKind: "FOOD", status: { in: ["PENDING", "RETRY"] }, accountDeletion: { is: { foodReviewScanComplete: true } } },
        { resourceKind: "MEDIA", status: "RETRY", lastErrorCategory: { in: ["PARK_REFERENCE_UNCERTAIN", "PARK_REVIEW_PENDING"] } },
      ],
    },
    orderBy: [{ cleanupDeadline: "asc" }, { createdAt: "asc" }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      resourceKind: true,
      resourceId: true,
      status: true,
      cleanupDeadline: true,
      attemptCount: true,
      lastErrorCategory: true,
      accountDeletion: { select: { status: true, cleanupDeadline: true, foodReviewScanComplete: true } },
    },
    }),
    prisma.accountDeletion.count({ where: { status: { not: "CLEANUP_COMPLETED" } } }),
    prisma.accountDeletion.count({ where: { status: "CLEANUP_PROCESSING" } }),
    prisma.accountDeletion.count({ where: { status: "CLEANUP_RETRY" } }),
    prisma.accountDeletion.count({ where: { status: { not: "CLEANUP_COMPLETED" }, lastErrorCategory: { not: null } } }),
    prisma.deletionCommunityReviewTask.count({ where: { status: "RETRY" } }),
    prisma.deletionCommunityReviewTask.count({ where: { resourceKind: "MEDIA", status: "RETRY" } }),
    prisma.accountDeletion.count({ where: { appleRevocationStatus: { in: ["PENDING", "PROCESSING", "RETRY"] } } }),
    prisma.accountDeletion.count({ where: { appleRevocationStatus: "RETRY" } }),
    prisma.accountDeletion.count({ where: { status: { not: "CLEANUP_COMPLETED" }, cleanupDeadline: { gte: now, lte: approachingDeadline } } }),
    prisma.accountDeletion.count({ where: { status: { not: "CLEANUP_COMPLETED" }, cleanupDeadline: { lt: now } } }),
    prisma.deletionCommunityReviewTask.count({ where: { status: { notIn: ["RESOLVED", "REMOVED_FROM_PUBLIC"] } } }),
    prisma.accountDeletion.findFirst({
      where: { status: { not: "CLEANUP_COMPLETED" } },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      select: { requestedAt: true },
    }),
  ]);

  const pageTasks = tasks.slice(0, 50);
  const nextCursor = tasks.length > 50 ? pageTasks.at(-1)?.id ?? null : null;
  const entries = await Promise.all(pageTasks.map(async (task) => {
    if (task.resourceKind === "MEDIA") {
      return {
        ...task,
        resourceType: "MEDIA_REVIEW" as const,
        resource: { id: "preserved-media", name: "Park media reference needs review", description: "The worker preserved this object because its ownership or an associated park reference is unresolved." },
      };
    }
    if (task.resourceKind === "PARK") {
      const id = Number(task.resourceId);
      const park = Number.isSafeInteger(id)
        ? await prisma.park.findUnique({
            where: { id },
            select: { id: true, name: true, title: true, address: true, lat: true, lon: true, photoUrl: true, submissionStatus: true, deletedAt: true },
          })
        : null;
      return { ...task, resource: park };
    }
    if (task.resourceId.startsWith("revision:")) {
      const revision = await prisma.foodRevision.findUnique({
        where: { id: task.resourceId.slice("revision:".length) },
        select: {
          id: true,
          name: true,
          brandName: true,
          barcode: true,
          imageUrl: true,
          createdAt: true,
          food: { select: { id: true, name: true, aliases: { where: { source: "USER" }, take: 50, select: { name: true, languageCode: true } } } },
        },
      });
      return {
        ...task,
        resourceType: "FOOD_REVISION" as const,
        resource: revision ? { ...revision, parentFoodName: revision.food.name, aliases: revision.food.aliases } : null,
      };
    }
    const food = await prisma.food.findUnique({
      where: { id: task.resourceId },
      select: {
        id: true,
        name: true,
        description: true,
        brandName: true,
        barcode: true,
        imageUrl: true,
        contributionStatus: true,
        aliases: { where: { source: "USER" }, orderBy: { normalizedName: "asc" }, take: 50, select: { name: true, languageCode: true } },
        revisions: { orderBy: { revisionNumber: "desc" }, take: 10, select: { name: true, brandName: true, barcode: true, imageUrl: true, createdAt: true } },
      },
    });
    return { ...task, resourceType: "FOOD" as const, resource: food };
  }));

  return NextResponse.json({
    tasks: entries,
    nextCursor,
    monitoring: {
      pendingDeletions,
      activeCleanups,
      retryRequired,
      failedOperations: failedDeletionOperations + failedReviewOperations,
      failedMediaCleanup,
      pendingAppleRevocations,
      failedAppleRevocations,
      oldestPendingDeletionAt: oldestPendingDeletion?.requestedAt.toISOString() ?? null,
      approachingDeadlines,
      overdueDeletions,
      outstandingReviewTasks,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
