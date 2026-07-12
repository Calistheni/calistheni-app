import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  R2_ASSETS_BUCKET_NAME,
  getExerciseAssetPublicUrl,
  r2,
} from "@/lib/r2";
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
  if (
    data.thumbnailKey !== `exercises/${data.slug}/thumbnail.webp` ||
    data.thumbnailUrl !== getExerciseAssetPublicUrl(data.thumbnailKey) ||
    (data.videoKey !== null &&
      (data.videoKey !== `exercises/${data.slug}/video.mp4` ||
        data.videoUrl !== getExerciseAssetPublicUrl(data.videoKey))) ||
    (data.videoKey === null && data.videoUrl !== null)
  ) {
    return createJsonErrorResponse("Invalid exercise media paths.", 400);
  }

  try {
    const mediaKeys = [data.thumbnailKey, data.videoKey].filter(
      (key): key is string => key !== null
    );
    const mediaChecks = await Promise.all(
      mediaKeys.map(async (key) => {
        try {
          await r2.send(
            new HeadObjectCommand({ Bucket: R2_ASSETS_BUCKET_NAME, Key: key })
          );
          return true;
        } catch {
          return false;
        }
      })
    );
    if (mediaChecks.some((exists) => !exists)) {
      return createJsonErrorResponse(
        "Exercise media upload was not found. Please upload the files again.",
        400
      );
    }

    const existing = await prisma.exercise.findUnique({
      where: { slug: data.slug },
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
        id: data.slug,
        slug: data.slug,
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
