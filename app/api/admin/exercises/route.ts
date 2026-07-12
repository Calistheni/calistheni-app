import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createUniqueExerciseSlug } from "@/lib/exercises";
import { prisma } from "@/lib/prisma";
import { adminExerciseCreationSchema } from "@/lib/validation/exercises";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return createJsonErrorResponse("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsed = adminExerciseCreationSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Invalid exercise details.",
      parsed.error.flatten().fieldErrors
    );
  }

  const data = parsed.data;
  const assetsBaseUrl = (process.env.NEXT_PUBLIC_ASSETS_URL ?? "").replace(
    /\/$/,
    ""
  );
  const isExerciseAssetUrl = (value: string) =>
    assetsBaseUrl.length > 0 &&
    value.startsWith(`${assetsBaseUrl}/exercise-assets/`);
  if (
    !isExerciseAssetUrl(data.thumbnailUrl) ||
    (data.videoUrl !== null && !isExerciseAssetUrl(data.videoUrl))
  ) {
    return createJsonErrorResponse(
      "Exercise media URLs must use the configured assets domain and exercise-assets path.",
      400
    );
  }

  try {
    const slug = await createUniqueExerciseSlug(data.name);
    const existing = await prisma.exercise.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      return createJsonErrorResponse(
        "An exercise with this name was created while you were uploading. Please try again.",
        409
      );
    }

    const exercise = await prisma.exercise.create({
      data: {
        id: slug,
        slug,
        name: data.name,
        muscle: data.muscle,
        trackingType: data.trackingType,
        bodyweightLoadFactor: data.bodyweightLoadFactor,
        thumbnailUrl: data.thumbnailUrl,
        videoUrl: data.videoUrl,
        createdByUserId: null,
      },
    });

    return NextResponse.json(exercise, { status: 201 });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
