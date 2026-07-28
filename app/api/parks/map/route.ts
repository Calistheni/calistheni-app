import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { parseParkMapQuery } from "@/lib/park-map-query";
import { getParksInBounds } from "@/lib/parks";
import type { ParksMapResponse } from "@/types/park";

export async function GET(request: Request) {
  const query = parseParkMapQuery(request.url);
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
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Unable to load map parks.", error);
    return createInternalServerErrorResponse();
  }
}
