import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ParkDetail, ParkSummary, ParkViewportBounds } from "@/types/park";

const parkSummarySelect = {
  id: true,
  name: true,
  title: true,
  lat: true,
  lon: true,
  address: true,
  equipment: {
    include: {
      equipment: {
        select: {
          name: true,
        },
      },
    },
  },
};

function mapParkDetail(park: {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  address: string | null;
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
    equipment: park.equipment.map((e) => e.equipment.name),
  };
}

export async function getParksInBounds(
  bounds: ParkViewportBounds,
  limit?: number
): Promise<ParkSummary[]> {
  const { minLat, maxLat, minLon, maxLon } = bounds;

  return prisma.park.findMany({
    where: {
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
    select: parkSummarySelect,
    take: limit,
  });
}
export async function getParkDetail(id: number): Promise<ParkDetail | null> {
  console.time(`db-${id}`);

  const park = await prisma.park.findUnique({
    where: {
      id,
    },
    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
  });

  console.timeEnd(`db-${id}`);

  if (!park) {
    return null;
  }

  return mapParkDetail(park);
}
