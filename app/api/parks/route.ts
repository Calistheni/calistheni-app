import { getParkDetail } from "@/lib/parks";
import { prisma } from "@/lib/prisma";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { parkMutationSchema } from "@/lib/validation/parks";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const parks = await prisma.park.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        title: true,
        address: true,
        lat: true,
        lon: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return NextResponse.json(parks);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
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
    const park = await prisma.park.create({
      data: {
        name: parsedBody.data.name,
        title: parsedBody.data.title,
        address: parsedBody.data.address,
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,

        equipment: {
          create: parsedBody.data.equipmentIds.map((equipmentId) => ({
            equipmentId,
          })),
        },
      },
    });

    const createdPark = await getParkDetail(park.id);

    return NextResponse.json(createdPark, { status: 201 });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
