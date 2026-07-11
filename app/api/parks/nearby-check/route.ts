import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  findNearbyPublicParks,
  PARK_DUPLICATE_WARNING_RADIUS_METERS,
} from "@/lib/nearby-parks";

function parseLatitude(value: string | null) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90
    ? parsed
    : null;
}

function parseLongitude(value: string | null) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180
    ? parsed
    : null;
}

function parseRadius(value: string | null) {
  if (value === null) {
    return PARK_DUPLICATE_WARNING_RADIUS_METERS;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000
    ? parsed
    : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseLatitude(searchParams.get("lat"));
  const lon = parseLongitude(searchParams.get("lon"));
  const radiusMeters = parseRadius(searchParams.get("radius"));

  if (lat === null || lon === null || radiusMeters === null) {
    return createJsonErrorResponse("Invalid nearby park check parameters.", 400);
  }

  try {
    const nearbyParks = await findNearbyPublicParks({
      lat,
      lon,
      radiusMeters,
    });

    return NextResponse.json({
      nearbyParks,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
