import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import {
  buildParkOverviewFeatures,
  type ParkOverviewRow,
} from "@/lib/park-map-overview";
import { prisma } from "@/lib/prisma";
import type { ParkOverviewFeature } from "@/types/park";

const getGlobalParkClusters = unstable_cache(
  async (): Promise<ParkOverviewFeature[]> => {
    const rows = await prisma.$queryRaw<ParkOverviewRow[]>`
      SELECT
        FLOOR(("lat" + 90) / 2)::int AS "latCell",
        FLOOR(("lon" + 180) / 2)::int AS "lonCell",
        AVG("lat")::float8 AS "lat",
        AVG("lon")::float8 AS "lon",
        COUNT(*)::int AS "count",
        MIN("id")::int AS "parkId",
        MIN("name") AS "name",
        MIN("title") AS "title",
        MIN("address") AS "address",
        MIN("photoUrl") AS "photoUrl",
        MAX("updatedAt") AS "updatedAt"
      FROM "Park"
      WHERE "deletedAt" IS NULL
        AND "submissionStatus" = 'APPROVED'
      GROUP BY FLOOR(("lat" + 90) / 2), FLOOR(("lon" + 180) / 2)
      ORDER BY COUNT(*) DESC
    `;

    return buildParkOverviewFeatures(rows);
  },
  ["parks-global-overview-v2"],
  { revalidate: 900, tags: ["parks-map-clusters"] }
);

export async function GET() {
  try {
    return NextResponse.json(await getGlobalParkClusters(), {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("Unable to load global park clusters.", error);
    return createInternalServerErrorResponse();
  }
}
