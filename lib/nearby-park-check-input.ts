import { PARK_DUPLICATE_WARNING_RADIUS_METERS } from "@/lib/park-distance";

export function parseNearbyParkCheckInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const lat = input.lat;
  const lon = input.lon;
  const radius = input.radius ?? PARK_DUPLICATE_WARNING_RADIUS_METERS;

  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lon !== "number" ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180 ||
    typeof radius !== "number" ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 1_000
  ) {
    return null;
  }

  return { lat, lon, radiusMeters: radius };
}
