import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blockerId = await getAuthenticatedUserId();
  if (!blockerId) return createUserUnauthorizedResponse();
  const { id: blockedId } = await params;
  if (blockerId === blockedId) return createJsonErrorResponse("You cannot block yourself.", 400);

  try {
    const target = await prisma.user.findFirst({ where: { id: blockedId, deletedAt: null }, select: { id: true } });
    if (!target) return createJsonErrorResponse("User not found.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        update: {},
        create: { blockerId, blockedId },
      });
      await tx.userFollow.deleteMany({
        where: { OR: [{ followerId: blockerId, followingId: blockedId }, { followerId: blockedId, followingId: blockerId }] },
      });
      await tx.workoutNotification.deleteMany({
        where: { OR: [{ userId: blockerId, actorId: blockedId }, { userId: blockedId, actorId: blockerId }] },
      });
    });
    return Response.json({ blocked: true });
  } catch (error) {
    console.error("USER_BLOCK_FAILED", { blockerId, blockedId, error });
    return createInternalServerErrorResponse("USER_BLOCK_FAILED");
  }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blockerId = await getAuthenticatedUserId();
  if (!blockerId) return createUserUnauthorizedResponse();
  const { id: blockedId } = await params;
  try {
    await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
    return Response.json({ blocked: false });
  } catch (error) {
    console.error("USER_UNBLOCK_FAILED", { blockerId, blockedId, error });
    return createInternalServerErrorResponse("USER_UNBLOCK_FAILED");
  }
}
