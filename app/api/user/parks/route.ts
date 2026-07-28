import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import {
  getParkPhotoUrlFromKey,
  isPendingParkPhotoKeyForUser,
  tryDeletePendingParkPhotoKey,
  uploadParkPhoto,
  type UploadedParkPhoto,
} from "@/lib/park-photo-storage";
import { normalizePhotoLocationVerifications } from "@/lib/photo-location-verification";
import {
  findNearbyPublicParks,
  PARK_DUPLICATE_WARNING_RADIUS_METERS,
} from "@/lib/nearby-parks";
import { prisma } from "@/lib/prisma";
import { parkMutationSchema } from "@/lib/validation/parks";
import { PARK_PHOTO_MAX_FILE_SIZE } from "@/lib/park-photo-file";

const MAX_MULTIPART_REQUEST_SIZE = PARK_PHOTO_MAX_FILE_SIZE + 1024 * 1024;

type CreateParkBody = {
  name?: unknown;
  title?: unknown;
  address?: unknown;
  lat?: unknown;
  lon?: unknown;
  equipmentIds?: unknown;
  photoUrl?: unknown;
  photoKey?: unknown;
  photoLocationVerifications?: unknown;
  allowNearbyPark?: unknown;
};

async function parseCreateRequest(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return {
      body: (await request.json()) as CreateParkBody,
      photo: null,
    };
  }

  const formData = await request.formData();
  const payload = formData.get("payload");
  const photo = formData.get("photo");

  if (typeof payload !== "string") {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    body: JSON.parse(payload) as CreateParkBody,
    photo: photo instanceof File && photo.size > 0 ? photo : null,
  };
}

function parseExistingPendingPhoto(body: CreateParkBody, userId: string) {
  const key = typeof body.photoKey === "string" ? body.photoKey.trim() : "";
  const url = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";

  if (!key && !url) {
    return null;
  }

  if (!key || !url || !isPendingParkPhotoKeyForUser(key, userId)) {
    throw new Error("INVALID_PHOTO_REFERENCE");
  }

  if (url !== getParkPhotoUrlFromKey(key)) {
    throw new Error("INVALID_PHOTO_REFERENCE");
  }

  return { key, photoUrl: url } satisfies UploadedParkPhoto;
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return createJsonErrorResponse(
      "Please sign in to submit a park.",
      401,
      "PARK_SUBMISSION_AUTH_REQUIRED"
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_MULTIPART_REQUEST_SIZE) {
    return createJsonValidationErrorResponse("Invalid park photo.", {
      photo: ["Image must be 15 MB or smaller."],
    });
  }

  let body: CreateParkBody;
  let photoFile: File | null;

  try {
    ({ body, photo: photoFile } = await parseCreateRequest(request));
  } catch {
    return createJsonErrorResponse("Invalid park submission payload.", 400);
  }

  const parsedBody = parkMutationSchema.safeParse(body);
  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid park payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  let existingPendingPhoto: UploadedParkPhoto | null;
  try {
    existingPendingPhoto = photoFile
      ? null
      : parseExistingPendingPhoto(body, userId);
  } catch {
    return createJsonErrorResponse("Invalid uploaded photo reference.", 400);
  }

  let uploadedPhoto: UploadedParkPhoto | null = existingPendingPhoto;

  try {
    const [nearbyParks, equipmentCount] = await Promise.all([
      findNearbyPublicParks({
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,
        radiusMeters: PARK_DUPLICATE_WARNING_RADIUS_METERS,
      }),
      prisma.equipment.count({
        where: { id: { in: parsedBody.data.equipmentIds } },
      }),
    ]);
    const closestNearbyPark = nearbyParks[0] ?? null;

    if (equipmentCount !== new Set(parsedBody.data.equipmentIds).size) {
      return createJsonErrorResponse(
        "One or more equipment items were not found.",
        400
      );
    }

    if (closestNearbyPark && body.allowNearbyPark !== true) {
      return NextResponse.json(
        { error: "A park already exists nearby.", nearbyParks },
        { status: 409 }
      );
    }

    if (photoFile) {
      uploadedPhoto = await uploadParkPhoto({
        file: photoFile,
        owner: userId,
        pending: true,
      });
    }

    const photoLocationVerifications = normalizePhotoLocationVerifications(
      body.photoLocationVerifications,
      uploadedPhoto ? 1 : 0,
      parsedBody.data.lat,
      parsedBody.data.lon
    );

    const park = await prisma.$transaction((tx) =>
      tx.park.create({
        data: {
          name: parsedBody.data.name,
          title: parsedBody.data.title,
          address: parsedBody.data.address,
          lat: parsedBody.data.lat,
          lon: parsedBody.data.lon,
          submissionStatus: "PENDING",
          submittedById: userId,
          photoUrl: uploadedPhoto?.photoUrl ?? null,
          photoKey: uploadedPhoto?.key ?? null,
          photoLocationVerifications: photoLocationVerifications.length
            ? photoLocationVerifications
            : undefined,
          nearbyParkWarning: Boolean(closestNearbyPark),
          closestNearbyParkId: closestNearbyPark?.id ?? null,
          closestNearbyParkDistanceMeters:
            closestNearbyPark?.distanceMeters ?? null,
          equipment: {
            create: parsedBody.data.equipmentIds.map((equipmentId) => ({
              equipmentId,
            })),
          },
        },
        select: { id: true },
      })
    );

    return NextResponse.json(
      {
        id: park.id,
        status: "PENDING",
        message: "Park submitted for admin review.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (uploadedPhoto && uploadedPhoto !== existingPendingPhoto) {
      await tryDeletePendingParkPhotoKey(uploadedPhoto.key);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    const isPhotoValidationError =
      message.includes("image") ||
      message.includes("file") ||
      message.includes("15 MB");

    if (isPhotoValidationError) {
      return createJsonValidationErrorResponse("Invalid park photo.", {
        photo: [message],
      });
    }

    console.error("Unable to create pending park submission.", {
      userId,
      error: message,
    });
    return createInternalServerErrorResponse();
  }
}
