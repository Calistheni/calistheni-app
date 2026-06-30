import { prisma } from "@/lib/prisma";
import type { ParkDetail, ParkSummary, ParkViewportBounds } from "@/types/park";

export const publicParkWhere = {
  deletedAt: null,
  submissionStatus: "APPROVED" as const,
};

const parkSummarySelect = {
  id: true,
  name: true,
  title: true,
  lat: true,
  lon: true,
  address: true,
};

function mapParkSummary(park: {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  address: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
}): ParkSummary {
  return {
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    updatedAt: park.updatedAt.toISOString(),
    deletedAt: park.deletedAt?.toISOString() ?? null,
  };
}

function mapParkDetail(park: {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  address: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
  equipment: Array<{
    equipment: {
      name: string;
    };
  }>;
}): ParkDetail {
  return {
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    updatedAt: park.updatedAt.toISOString(),
    deletedAt: park.deletedAt?.toISOString() ?? null,
    equipment: park.equipment.map((e) => e.equipment.name),
  };
}

export async function getParksInBounds(
  bounds: ParkViewportBounds,
  limit?: number
): Promise<ParkSummary[]> {
  const { minLat, maxLat, minLon, maxLon } = bounds;

  const parks = await prisma.park.findMany({
    where: {
      ...publicParkWhere,
      lat: {
        gte: minLat,
        lte: maxLat,
      },
      ...(minLon <= maxLon
        ? {
            lon: {
              gte: minLon,
              lte: maxLon,
            },
          }
        : {
            OR: [{ lon: { gte: minLon } }, { lon: { lte: maxLon } }],
          }),
    },
    select: {
      ...parkSummarySelect,
      updatedAt: true,
      deletedAt: true,
    },
    take: limit,
  });

  return parks.map(mapParkSummary);
}

export async function getParkDetail(id: number): Promise<ParkDetail | null> {
  const park = await prisma.park.findFirst({
    where: {
      id,
      ...publicParkWhere,
    },
    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
  });

  if (!park) {
    return null;
  }

  return mapParkDetail(park);
}
