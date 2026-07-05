import { NextResponse } from "next/server";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";

export async function GET() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  try {
    const following = await prisma.userFollow.findMany({
      where: {
        followerId: userId,
      },
      select: {
        followingId: true,
      },
    });
    const followingIds = following.map((item) => item.followingId);

    if (followingIds.length === 0) {
      return NextResponse.json([]);
    }

    const workouts = await prisma.workout.findMany({
      where: {
        userId: {
          in: followingIds,
        },
        visibility: "PUBLIC",
        completedAt: {
          not: null,
        },
      },
      orderBy: {
        completedAt: "desc",
      },
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        exercises: {
          include: {
            sets: true,
          },
        },
      },
    });

    return NextResponse.json(workouts.map(mapWorkoutSummary));
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
