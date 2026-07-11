import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { PENDING_PARK_PHOTO_PREFIX } from "@/lib/park-photo-storage";
import { normalizePhotoLocationVerifications } from "@/lib/photo-location-verification";
import {
  findNearbyPublicParks,
  PARK_DUPLICATE_WARNING_RADIUS_METERS,
} from "@/lib/nearby-parks";
import { prisma } from "@/lib/prisma";
import { parkMutationSchema } from "@/lib/validation/parks";

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

function parsePendingPhotoKey(value: unknown, userId: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const photoKey = value.trim();

  if (!photoKey.startsWith(`${PENDING_PARK_PHOTO_PREFIX}${userId}/`)) {
    return null;
  }

  return photoKey;
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let body: CreateParkBody;

  try {
    body = (await request.json()) as CreateParkBody;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsedBody = parkMutationSchema.safeParse({
    name: body.name,
    title: body.title,
    address: body.address,
    lat: body.lat,
    lon: body.lon,
    equipmentIds: body.equipmentIds,
  });

  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid park payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  const photoUrl =
    typeof body.photoUrl === "string" && body.photoUrl.length > 0
      ? body.photoUrl
      : null;
  const photoKey = parsePendingPhotoKey(body.photoKey, userId);

  if (body.photoKey && !photoKey) {
    return createJsonErrorResponse("Invalid uploaded photo key.", 400);
  }

  if (photoUrl && !photoKey) {
    return createJsonErrorResponse("Uploaded photo key is required.", 400);
  }

  const photoLocationVerifications = normalizePhotoLocationVerifications(
    body.photoLocationVerifications,
    photoUrl ? 1 : 0,
    parsedBody.data.lat,
    parsedBody.data.lon
  );

  try {
    const nearbyParks = await findNearbyPublicParks({
      lat: parsedBody.data.lat,
      lon: parsedBody.data.lon,
      radiusMeters: PARK_DUPLICATE_WARNING_RADIUS_METERS,
    });
    const closestNearbyPark = nearbyParks[0] ?? null;

    if (closestNearbyPark && body.allowNearbyPark !== true) {
      return NextResponse.json(
        {
          error: "A park already exists nearby.",
          nearbyParks,
        },
        { status: 409 }
      );
    }

    const park = await prisma.park.create({
      data: {
        name: parsedBody.data.name,
        title: parsedBody.data.title,
        address: parsedBody.data.address,
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,
        submissionStatus: "PENDING",
        submittedById: userId,
        photoUrl,
        photoKey,
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
      select: {
        id: true,
      },
    });

    return NextResponse.json(
      {
        id: park.id,
        status: "PENDING",
        message: "Park submitted for admin review.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
