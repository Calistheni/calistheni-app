import { prisma } from "@/lib/prisma";
import { publicParkWhere } from "@/lib/parks";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  isValidDateString,
} from "@/lib/api-response";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const since = searchParams.get("since");

  if (!since) {
    return NextResponse.json({
      version: null,
      updated: [],
      deleted: [],
    });
  }

  if (!isValidDateString(since)) {
    return createJsonErrorResponse("Invalid since parameter.", 400);
  }

  try {
    const changedParks = await prisma.park.findMany({
      where: {
        updatedAt: {
          gt: new Date(since),
        },
      },
      select: {
        id: true,
        name: true,
        title: true,
        lat: true,
        lon: true,
        address: true,
        submissionStatus: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    const latestPark = await prisma.park.findFirst({
      where: {
        ...publicParkWhere,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        updatedAt: true,
      },
    });

    return NextResponse.json({
      version: latestPark?.updatedAt?.toISOString() ?? null,
      updated: changedParks
        .filter((park) => !park.deletedAt && park.submissionStatus === "APPROVED")
        .map((park) => ({
          id: park.id,
          name: park.name,
          title: park.title,
          lat: park.lat,
          lon: park.lon,
          address: park.address,
          updatedAt: park.updatedAt.toISOString(),
          deletedAt: null,
        })),
      deleted: changedParks
        .filter((park) => park.deletedAt || park.submissionStatus !== "APPROVED")
        .map((park) => park.id),
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
