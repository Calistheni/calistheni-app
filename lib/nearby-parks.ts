import { prisma } from "@/lib/prisma";
import { publicParkWhere } from "@/lib/parks";
import {
  calculateDistanceMeters,
  getCoordinateBounds,
  PARK_DUPLICATE_WARNING_RADIUS_METERS,
} from "@/lib/park-distance";

export { PARK_DUPLICATE_WARNING_RADIUS_METERS };

export type NearbyPark = {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  distanceMeters: number;
};

type FindNearbyParksInput = {
  lat: number;
  lon: number;
  radiusMeters: number;
  limit?: number;
};

export async function findNearbyPublicParks({
  lat,
  lon,
  radiusMeters,
  limit = 10,
}: FindNearbyParksInput): Promise<NearbyPark[]> {
  const bounds = getCoordinateBounds(lat, lon, radiusMeters);
  const candidateLimit = Math.max(limit * 10, 50);
  const parks = await prisma.park.findMany({
    where: {
      ...publicParkWhere,
      lat: {
        gte: bounds.minLat,
        lte: bounds.maxLat,
      },
      lon: {
        gte: bounds.minLon,
        lte: bounds.maxLon,
      },
    },
    select: {
      id: true,
      name: true,
      title: true,
      lat: true,
      lon: true,
    },
    take: candidateLimit,
  });

  return parks
    .map((park) => ({
      ...park,
      distanceMeters: Math.round(
        calculateDistanceMeters(lat, lon, park.lat, park.lon)
      ),
    }))
    .filter((park) => park.distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
    .slice(0, limit);
}
