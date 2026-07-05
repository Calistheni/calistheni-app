import { prisma } from "@/lib/prisma";
import {
  getMainParkPhotoUrl,
  latestParkPhotoQuery,
  publicParkWhere,
} from "@/lib/parks";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = 20;

  if (!Number.isInteger(page) || page < 1) {
    return createJsonErrorResponse("Invalid page parameter.", 400);
  }

  try {
    const parks = await prisma.park.findMany({
      where: {
        ...publicParkWhere,
        OR: [
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            address: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: {
        name: "asc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        address: true,
        lat: true,
        lon: true,
        photoUrl: true,
        photos: latestParkPhotoQuery,
      },
    });

    return NextResponse.json(
      parks.map((park) => ({
        id: park.id,
        name: park.name,
        address: park.address,
        lat: park.lat,
        lon: park.lon,
        photoUrl: getMainParkPhotoUrl(park),
      }))
    );
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
