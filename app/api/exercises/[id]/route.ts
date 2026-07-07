import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const exercise = await prisma.exercise.findUnique({
      where: {
        id,
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
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
