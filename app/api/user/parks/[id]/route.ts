import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { parkMutationSchema } from "@/lib/validation/parks";

export async function PATCH(
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsedBody = parkMutationSchema.safeParse(body);

  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid park payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  try {
    const existingPark = await prisma.park.findFirst({
      where: {
        id: parkId,
        deletedAt: null,
        submittedById: userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingPark) {
      return createJsonErrorResponse("Park not found.", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.park.update({
        where: {
          id: parkId,
        },
        data: {
          name: parsedBody.data.name,
          title: parsedBody.data.title,
          address: parsedBody.data.address,
          lat: parsedBody.data.lat,
          lon: parsedBody.data.lon,
          submissionStatus: "PENDING",
          reviewedAt: null,
          rejectionReason: null,
        },
      });

      await tx.parkEquipment.deleteMany({
        where: {
          parkId,
        },
      });

      if (parsedBody.data.equipmentIds.length) {
        await tx.parkEquipment.createMany({
          data: parsedBody.data.equipmentIds.map((equipmentId) => ({
            parkId,
            equipmentId,
          })),
        });
      }
    });

    return NextResponse.json({
      success: true,
      status: "PENDING",
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(
  _request: Request,
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

  try {
    const existingPark = await prisma.park.findFirst({
      where: {
        id: parkId,
        deletedAt: null,
        submittedById: userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingPark) {
      return createJsonErrorResponse("Park not found.", 404);
    }

    await prisma.park.update({
      where: {
        id: parkId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
