import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { getAdminParkPhotos } from "@/lib/admin-park-photos";
import { getAdminParkDetail } from "@/lib/admin-parks";
import {
  deleteParkPhotoObject,
  uploadParkPhoto,
  type UploadedParkPhoto,
} from "@/lib/park-photo-storage";
import { PARK_PHOTO_MAX_COUNT, PARK_PHOTO_MAX_FILE_SIZE } from "@/lib/park-photo-file";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const MAX_MULTIPART_REQUEST_SIZE =
  PARK_PHOTO_MAX_COUNT * PARK_PHOTO_MAX_FILE_SIZE + 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  const { id } = await params;
  const parkId = parsePositiveInteger(id);

  if (parkId === null) {
    return createJsonErrorResponse("Invalid park id.", 400);
  }

  try {
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
      },
      select: {
        id: true,
      },
    });

    if (!park) {
      return createJsonErrorResponse("Park not found.", 404);
    }

    return NextResponse.json({
      photos: await getAdminParkPhotos(parkId),
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();

  const { id } = await params;
  const parkId = parsePositiveInteger(id);
  if (parkId === null) return createJsonErrorResponse("Invalid park id.", 400);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_MULTIPART_REQUEST_SIZE) {
    return createJsonErrorResponse("Images exceed the maximum upload size.", 413);
  }

  let files: File[];
  try {
    const formData = await request.formData();
    files = formData
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
  } catch {
    return createJsonErrorResponse("Unable to read the uploaded photos.", 400);
  }

  if (!files.length) return createJsonErrorResponse("No photos were uploaded.", 400);
  if (files.length > PARK_PHOTO_MAX_COUNT) {
    return createJsonErrorResponse(
      `Choose no more than ${PARK_PHOTO_MAX_COUNT} photos.`,
      400
    );
  }

  const uploaded: UploadedParkPhoto[] = [];
  try {
    const park = await prisma.park.findUnique({
      where: { id: parkId },
      select: { id: true },
    });
    if (!park) return createJsonErrorResponse("Park not found.", 404);

    const existingCount = await prisma.parkPhoto.count({ where: { parkId } });
    if (existingCount + files.length > PARK_PHOTO_MAX_COUNT) {
      return createJsonErrorResponse(
        `A park can have no more than ${PARK_PHOTO_MAX_COUNT} photos.`,
        400
      );
    }

    for (const file of files) {
      uploaded.push(await uploadParkPhoto({ file, owner: "admin", pending: false }));
    }

    await prisma.$transaction(async (tx) => {
      const hasVisiblePhoto = await tx.parkPhoto.findFirst({
        where: { parkId, hiddenAt: null },
        select: { id: true },
      });

      await tx.parkPhoto.createMany({
        data: uploaded.map((photo, index) => ({
          parkId,
          url: photo.photoUrl,
          isPrimary: !hasVisiblePhoto && index === 0,
        })),
      });

      if (!hasVisiblePhoto && uploaded[0]) {
        await tx.park.update({
          where: { id: parkId },
          data: { photoUrl: uploaded[0].photoUrl, photoKey: uploaded[0].key },
        });
      }
    });

    return NextResponse.json(
      {
        park: await getAdminParkDetail(parkId),
        photos: await getAdminParkPhotos(parkId),
      },
      { status: 201 }
    );
  } catch (error) {
    await Promise.all(
      uploaded.map(async (photo) => {
        try {
          await deleteParkPhotoObject(photo.key);
        } catch (cleanupError) {
          console.error("Unable to roll back admin park photo upload.", {
            parkId,
            key: photo.key,
            error: cleanupError instanceof Error ? cleanupError.message : "Unknown R2 error",
          });
        }
      })
    );
    const message = error instanceof Error ? error.message : "Unable to upload photos.";
    const validationError = message.includes("image") || message.includes("file") || message.includes("15 MB");
    if (!validationError) console.error("ADMIN_PARK_PHOTO_UPLOAD_FAILED", { parkId, error: message });
    return createJsonErrorResponse(validationError ? message : "Unable to upload photos. Please try again.", validationError ? 400 : 500);
  }
}
