import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { getParksInBounds } from "@/lib/parks";
import type { ParksMapResponse } from "@/types/park";

const MAX_LONGITUDE_SPAN = 180;
const MAX_LATITUDE_SPAN = 120;

function parseFiniteParameter(url: URL, name: string) {
  const rawValue = url.searchParams.get(name);
  if (rawValue === null || rawValue.trim() === "") {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function longitudeSpan(west: number, east: number) {
  return west <= east ? east - west : 180 - west + (east + 180);
}

function getResultLimit(zoom: number) {
  if (zoom < 6) return 1_500;
  if (zoom < 9) return 2_500;
  return 5_000;
}

function getAreaKey(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number
) {
  return [
    Math.floor(zoom),
    west.toFixed(3),
    south.toFixed(3),
    east.toFixed(3),
    north.toFixed(3),
  ].join(":");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const west = parseFiniteParameter(url, "west");
  const south = parseFiniteParameter(url, "south");
  const east = parseFiniteParameter(url, "east");
  const north = parseFiniteParameter(url, "north");
  const zoom = parseFiniteParameter(url, "zoom");

  if (
    west === null ||
    south === null ||
    east === null ||
    north === null ||
    zoom === null ||
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90 ||
    south >= north ||
    west === east ||
    zoom < 0 ||
    zoom > 24
  ) {
    return createJsonErrorResponse("Invalid map bounds or zoom.", 400);
  }

  if (
    longitudeSpan(west, east) > MAX_LONGITUDE_SPAN ||
    north - south > MAX_LATITUDE_SPAN
  ) {
    return createJsonErrorResponse("Zoom in to search this area.", 400);
  }

  const limit = getResultLimit(zoom);

  try {
    const matches = await getParksInBounds(
      {
        minLat: south,
        maxLat: north,
        minLon: west,
        maxLon: east,
        zoom,
      },
      limit + 1
    );
    const parks = matches.slice(0, limit);
    const response: ParksMapResponse = {
      parks,
      areaKey: getAreaKey(west, south, east, north, zoom),
      version:
        parks.reduce<string | null>(
          (latest, park) =>
            latest === null || park.updatedAt > latest ? park.updatedAt : latest,
          null
        ),
      truncated: matches.length > limit,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Unable to load map parks.", error);
    return createInternalServerErrorResponse();
  }
}
