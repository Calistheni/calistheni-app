import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getAuthenticatedUserId();

  try {
    const exercise = await prisma.exercise.findFirst({
      where: {
        id,
        ...exerciseVisibilityWhere(userId),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        muscle: true,
        thumbnailUrl: true,
        videoUrl: true,
        trackingType: true,
        bodyweightLoadFactor: true,
        createdByUserId: true,
      },
    });

    if (!exercise) {
      return createJsonErrorResponse("Exercise not found.", 404);
    }

    return NextResponse.json({
      id: exercise.id,
      slug: exercise.slug,
      name: exercise.name,
      muscle: exercise.muscle,
      thumbnailUrl: exercise.thumbnailUrl,
      videoUrl: exercise.videoUrl,
      trackingType: exercise.trackingType,
      bodyweightLoadFactor: exercise.bodyweightLoadFactor,
      createdByUserId: exercise.createdByUserId,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
