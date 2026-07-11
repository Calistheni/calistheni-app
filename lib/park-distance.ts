export const PARK_DUPLICATE_WARNING_RADIUS_METERS = 100;

const EARTH_RADIUS_METERS = 6_371_000;

type ParkCoordinates = {
  lat: number;
  lon: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMeters(
  sourceLat: number,
  sourceLon: number,
  targetLat: number,
  targetLon: number
) {
  const deltaLat = toRadians(targetLat - sourceLat);
  const deltaLon = toRadians(targetLon - sourceLon);
  const sourceLatRadians = toRadians(sourceLat);
  const targetLatRadians = toRadians(targetLat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(sourceLatRadians) *
      Math.cos(targetLatRadians) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function getCoordinateBounds(
  lat: number,
  lon: number,
  radiusMeters: number
) {
  const latDelta = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const lonDelta =
    ((radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI)) /
    Math.max(Math.cos(toRadians(lat)), 0.01);

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

export function findClosestNearbyPark<TPark extends ParkCoordinates>(
  parks: TPark[],
  lat: number,
  lon: number,
  radiusMeters = PARK_DUPLICATE_WARNING_RADIUS_METERS
): (TPark & { distanceMeters: number }) | null {
  let closestPark: (TPark & { distanceMeters: number }) | null = null;

  for (const park of parks) {
    const distanceMeters = calculateDistanceMeters(lat, lon, park.lat, park.lon);

    if (distanceMeters > radiusMeters) {
      continue;
    }

    if (!closestPark || distanceMeters < closestPark.distanceMeters) {
      closestPark = {
        ...park,
        distanceMeters,
      };
    }
  }

  return closestPark;
}
