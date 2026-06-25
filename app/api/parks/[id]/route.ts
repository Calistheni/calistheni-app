import { getParkDetail } from "@/lib/parks";
import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { parkMutationSchema } from "@/lib/validation/parks";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parkId = parsePositiveInteger(id);

  if (parkId === null) {
    return createJsonErrorResponse("Invalid park id.", 400);
  }

  try {
    const park = await getParkDetail(parkId);

    if (!park) {
      return createJsonErrorResponse("Park not found.", 404);
    }

    return NextResponse.json(park);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function PATCH(
  request: Request,
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

    const updatedPark = await getParkDetail(parkId);

    if (!updatedPark) {
      return createJsonErrorResponse("Park not found.", 404);
    }

    return NextResponse.json(updatedPark);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(
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
    const existingPark = await prisma.park.findFirst({
      where: {
        id: parkId,
        deletedAt: null,
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
