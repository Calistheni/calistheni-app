import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse, parsePositiveInteger } from "@/lib/api-response";
import { displayUsername, getCommunityWorkoutForViewer } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const pageSize = 20;
const commentSelect = {
  id: true,
  content: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, name: true, username: true, image: true } },
} as const;

function mapComment(comment: { id: string; content: string; createdAt: Date; userId: string; user: { id: string; name: string | null; username: string | null; image: string | null } }, viewerId: string) {
  return { ...comment, isOwn: comment.userId === viewerId, createdAt: comment.createdAt.toISOString(), user: { ...comment.user, username: displayUsername(comment.user) } };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const workoutId = parsePositiveInteger((await params).id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  try {
    if (!(await getCommunityWorkoutForViewer(workoutId, userId))) return createJsonErrorResponse("Workout not found.", 404);
    const cursor = new URL(request.url).searchParams.get("cursor");
    const comments = await prisma.workoutComment.findMany({
      where: { workoutId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: commentSelect,
    });
    const hasMore = comments.length > pageSize;
    const visible = comments.slice(0, pageSize);
    return NextResponse.json({ comments: visible.map((comment) => mapComment(comment, userId)), nextCursor: hasMore ? visible.at(-1)?.id ?? null : null });
  } catch (error) {
    console.error("WORKOUT_COMMENTS_LOAD_FAILED", { workoutId, userId, error });
    return createInternalServerErrorResponse("WORKOUT_COMMENTS_LOAD_FAILED");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const workoutId = parsePositiveInteger((await params).id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  let content: unknown;
  try { content = (await request.json()).content; } catch { return createJsonErrorResponse("Invalid comment payload.", 400); }
  if (typeof content !== "string" || !content.trim() || content.trim().length > 500) return createJsonErrorResponse("Comments must be between 1 and 500 characters.", 400);
  try {
    const workout = await getCommunityWorkoutForViewer(workoutId, userId);
    if (!workout) return createJsonErrorResponse("Workout not found.", 404);
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.workoutComment.create({ data: { workoutId, userId, content: content.trim() }, select: commentSelect });
      if (workout.userId !== userId) await tx.workoutNotification.create({ data: { userId: workout.userId, actorId: userId, workoutId, commentId: created.id, type: "WORKOUT_COMMENTED" } });
      return created;
    });
    return NextResponse.json({ comment: mapComment(comment, userId) }, { status: 201 });
  } catch (error) {
    console.error("WORKOUT_COMMENT_CREATE_FAILED", { workoutId, userId, error });
    return createInternalServerErrorResponse("WORKOUT_COMMENT_CREATE_FAILED");
  }
}
