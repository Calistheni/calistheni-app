import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const latestPark = await prisma.park.findFirst({
    where: {
      deletedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      updatedAt: true,
    },
  });

  return NextResponse.json({
    lastUpdated: latestPark?.updatedAt ?? null,
  });
}
