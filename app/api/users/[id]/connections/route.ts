import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: profileUserId } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const cursor = searchParams.get("cursor");

  if (type !== "followers" && type !== "following") {
    return createJsonErrorResponse("Invalid connection list.", 400);
  }

  const session = await auth();

  try {
    const cursorParts = cursor?.split("|");
    const rows = await prisma.userFollow.findMany({
      where:
        type === "followers"
          ? { followingId: profileUserId }
          : { followerId: profileUserId },
      orderBy: [{ createdAt: "desc" }, { followerId: "asc" }, { followingId: "asc" }],
      ...(cursorParts?.length === 2
        ? {
            cursor: {
              followerId_followingId: {
                followerId: cursorParts[0],
                followingId: cursorParts[1],
              },
            },
            skip: 1,
          }
        : {}),
      take: PAGE_SIZE + 1,
      select: {
        followerId: true,
        followingId: true,
        follower: { select: { id: true, name: true, image: true } },
        following: { select: { id: true, name: true, image: true } },
      },
    });
    const pageRows = rows.slice(0, PAGE_SIZE);
    const users = pageRows.map((row) =>
      type === "followers" ? row.follower : row.following
    );
    const viewerId = session?.user?.id;
    const viewerFollows = viewerId
      ? await prisma.userFollow.findMany({
          where: {
            followerId: viewerId,
            followingId: { in: users.map((user) => user.id) },
          },
          select: { followingId: true },
        })
      : [];
    const followedIds = new Set(viewerFollows.map((row) => row.followingId));
    const last = pageRows.at(-1);

    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        isCurrentUser: user.id === viewerId,
        isFollowedByCurrentUser: followedIds.has(user.id),
      })),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? `${last.followerId}|${last.followingId}`
          : null,
    });
  } catch (error) {
    console.error("USER_CONNECTIONS_FAILED", {
      profileUserId,
      type,
      error,
    });
    return createInternalServerErrorResponse("USER_CONNECTIONS_FAILED");
  }
}
