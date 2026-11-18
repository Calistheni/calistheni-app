import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  findNearbyPublicParks,
} from "@/lib/nearby-parks";
import { parseNearbyParkCheckInput } from "@/lib/nearby-park-check-input";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid nearby park check parameters.", 400);
  }
  const input = parseNearbyParkCheckInput(body);
  if (!input) {
    return createJsonErrorResponse("Invalid nearby park check parameters.", 400);
  }

  try {
    const nearbyParks = await findNearbyPublicParks({
      ...input,
    });

    return NextResponse.json({
      nearbyParks,
    });
  } catch {
    console.error("Unable to check nearby parks.");
    return createInternalServerErrorResponse();
  }
}
