import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse, parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { id, commentId } = await params;
  const workoutId = parsePositiveInteger(id);
  if (workoutId === null || !commentId) return createJsonErrorResponse("Invalid comment.", 400);
  try {
    const removed = await prisma.workoutComment.deleteMany({ where: { id: commentId, workoutId, userId } });
    if (!removed.count) return createJsonErrorResponse("Comment not found.", 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WORKOUT_COMMENT_DELETE_FAILED", { workoutId, commentId, userId, error });
    return createInternalServerErrorResponse("WORKOUT_COMMENT_DELETE_FAILED");
  }
}
