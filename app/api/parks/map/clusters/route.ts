import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import type { ParkClusterPlaceholder } from "@/types/park";

type ClusterRow = {
  lat: number;
  lon: number;
  count: number;
};

const getGlobalParkClusters = unstable_cache(
  async (): Promise<ParkClusterPlaceholder[]> => {
    const rows = await prisma.$queryRaw<ClusterRow[]>`
      SELECT
        AVG("lat")::float8 AS "lat",
        AVG("lon")::float8 AS "lon",
        COUNT(*)::int AS "count"
      FROM "Park"
      WHERE "deletedAt" IS NULL
        AND "submissionStatus" = 'APPROVED'
      GROUP BY FLOOR(("lat" + 90) / 2), FLOOR(("lon" + 180) / 2)
      ORDER BY COUNT(*) DESC
    `;

    return rows.map((row) => ({
      lat: Number(row.lat),
      lon: Number(row.lon),
      count: Number(row.count),
    }));
  },
  ["parks-global-cluster-placeholders-v1"],
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
