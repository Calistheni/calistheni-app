import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const muscle = (searchParams.get("muscle") ?? "").trim();

  if (q.length > 100 || muscle.length > 100) {
    return createJsonErrorResponse("Search filters are too long.", 400);
  }

  try {
    const exercises = await prisma.exercise.findMany({
      where: {
        ...(q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  muscle: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
        ...(muscle
          ? {
              muscle,
            }
          : {}),
      },
      orderBy: [
        {
          muscle: "asc",
        },
        {
          name: "asc",
        },
      ],
      take: 300,
      select: {
        id: true,
        slug: true,
        name: true,
        muscle: true,
        thumbnailUrl: true,
        videoUrl: true,
      },
    });

    return NextResponse.json(
      exercises.map((exercise) => ({
        id: exercise.id,
        slug: exercise.slug,
        name: exercise.name,
        muscle: exercise.muscle,
        thumbnailUrl: exercise.thumbnailUrl,
        videoUrl: exercise.videoUrl,
      }))
    );
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
