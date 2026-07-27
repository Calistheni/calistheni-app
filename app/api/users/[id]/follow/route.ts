import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const followerId = await getAuthenticatedUserId();

  if (!followerId) {
    return createUserUnauthorizedResponse();
  }

  const { id: followingId } = await params;

  if (followerId === followingId) {
    return createJsonErrorResponse("You cannot follow yourself.", 400);
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: followingId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return createJsonErrorResponse("User not found.", 404);
    }

    await prisma.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
      update: {},
      create: {
        followerId,
        followingId,
      },
    });

    const [followerCount, followingCount] = await Promise.all([
      prisma.userFollow.count({ where: { followingId } }),
      prisma.userFollow.count({ where: { followerId: followingId } }),
    ]);

    return NextResponse.json({
      following: true,
      followerCount,
      followingCount,
    });
  } catch (error) {
    console.error("FOLLOW_FAILED", { followerId, followingId, error });
    return createInternalServerErrorResponse("FOLLOW_FAILED");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const followerId = await getAuthenticatedUserId();

  if (!followerId) {
    return createUserUnauthorizedResponse();
  }

  const { id: followingId } = await params;

  try {
    await prisma.userFollow.deleteMany({
      where: {
        followerId,
        followingId,
      },
    });

    const [followerCount, followingCount] = await Promise.all([
      prisma.userFollow.count({ where: { followingId } }),
      prisma.userFollow.count({ where: { followerId: followingId } }),
    ]);

    return NextResponse.json({
      following: false,
      followerCount,
      followingCount,
    });
  } catch (error) {
    console.error("UNFOLLOW_FAILED", { followerId, followingId, error });
    return createInternalServerErrorResponse("UNFOLLOW_FAILED");
  }
}
