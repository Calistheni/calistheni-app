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
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
        deletedAt: null,
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
