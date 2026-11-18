import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { parseParkMapParams } from "@/lib/park-map-query";
import { getParksInBounds } from "@/lib/parks";
import type { ParksMapResponse } from "@/types/park";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid map bounds or zoom.", 400, "PARK_BOUNDS_INVALID");
  }
  const params = new URLSearchParams(
    body && typeof body === "object"
      ? Object.entries(body).flatMap(([key, value]) =>
          typeof value === "string" || typeof value === "number"
            ? [[key, String(value)]]
            : []
        )
      : []
  );
  const query = parseParkMapParams(params);
  if (!query.success) {
    return createJsonErrorResponse(query.message, 400, query.code);
  }

  try {
    const matches = await getParksInBounds(query.bounds, query.limit + 1);
    const parks = matches.slice(0, query.limit);
    const response: ParksMapResponse = {
      parks,
      areaKey: query.areaKey,
      version:
        parks.reduce<string | null>(
          (latest, park) =>
            latest === null || park.updatedAt > latest ? park.updatedAt : latest,
          null
        ),
      truncated: matches.length > query.limit,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    console.error("Unable to load map parks.");
    return createInternalServerErrorResponse();
  }
}
