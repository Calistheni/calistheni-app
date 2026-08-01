import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse, parsePositiveInteger } from "@/lib/api-response";
import { getCommunityWorkoutForViewer } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

async function details(workoutId: number, viewerId: string) {
  const [likeCount, currentUserLike] = await Promise.all([
    prisma.workoutLike.count({ where: { workoutId } }),
    prisma.workoutLike.findUnique({ where: { workoutId_userId: { workoutId, userId: viewerId } }, select: { workoutId: true } }),
  ]);
  return { likeCount, likedByCurrentUser: Boolean(currentUserLike) };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const workoutId = parsePositiveInteger((await params).id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  try {
    const workout = await getCommunityWorkoutForViewer(workoutId, userId);
    if (!workout) return createJsonErrorResponse("Workout not found.", 404);
    if (workout.userId === userId) return createJsonErrorResponse("You cannot like your own workout.", 400);
    let created = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.workoutLike.create({ data: { workoutId, userId } });
        await tx.workoutNotification.create({ data: { userId: workout.userId, actorId: userId, workoutId, type: "WORKOUT_LIKED" } });
      });
      created = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    return NextResponse.json({ ...(await details(workoutId, userId)), created });
  } catch (error) {
    console.error("WORKOUT_LIKE_FAILED", { workoutId, userId, error });
    return createInternalServerErrorResponse("WORKOUT_LIKE_FAILED");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const workoutId = parsePositiveInteger((await params).id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  try {
    const workout = await getCommunityWorkoutForViewer(workoutId, userId);
    if (!workout) return createJsonErrorResponse("Workout not found.", 404);
    await prisma.workoutLike.deleteMany({ where: { workoutId, userId } });
    return NextResponse.json(await details(workoutId, userId));
  } catch (error) {
    console.error("WORKOUT_UNLIKE_FAILED", { workoutId, userId, error });
    return createInternalServerErrorResponse("WORKOUT_UNLIKE_FAILED");
  }
}
