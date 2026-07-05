import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { publicParkWhere } from "@/lib/parks";
import { prisma } from "@/lib/prisma";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { parkMutationSchema } from "@/lib/validation/parks";

type ParkEditBody = {
  name?: unknown;
  title?: unknown;
  address?: unknown;
  lat?: unknown;
  lon?: unknown;
  equipmentIds?: unknown;
  photoUrls?: unknown;
};

function parsePhotoUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 10);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const parkId = parsePositiveInteger(id);

  if (parkId === null) {
    return createJsonErrorResponse("Invalid park id.", 400);
  }

  let body: ParkEditBody;

  try {
    body = (await request.json()) as ParkEditBody;
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
      "Invalid park edit payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  const photoUrls = parsePhotoUrls(body.photoUrls);

  try {
    const [park, equipmentCount] = await Promise.all([
      prisma.park.findFirst({
        where: {
          id: parkId,
          ...publicParkWhere,
        },
        select: {
          id: true,
        },
      }),
      prisma.equipment.count({
        where: {
          id: {
            in: parsedBody.data.equipmentIds,
          },
        },
      }),
    ]);

    if (!park) {
      return createJsonErrorResponse("Park not found.", 404);
    }

    if (equipmentCount !== new Set(parsedBody.data.equipmentIds).size) {
      return createJsonErrorResponse("One or more equipment items were not found.", 400);
    }

    const editSubmission = await prisma.parkEditSubmission.create({
      data: {
        parkId,
        submittedById: userId,
        name: parsedBody.data.name,
        title: parsedBody.data.title,
        address: parsedBody.data.address,
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,
        equipmentIds: parsedBody.data.equipmentIds,
        photoUrls,
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json(
      {
        id: editSubmission.id,
        status: "PENDING",
        message: "Park edit submitted for admin review.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
