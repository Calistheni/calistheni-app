import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const since = searchParams.get("since");

  if (!since) {
    return NextResponse.json({
      updated: [],
      deleted: [],
    });
  }

  const changedParks = await prisma.park.findMany({
    where: {
      updatedAt: {
        gt: new Date(since),
      },
    },
    select: {
      id: true,
      name: true,
      title: true,
      lat: true,
      lon: true,
      address: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
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
    version: latestPark?.updatedAt?.toISOString() ?? null,

    updated: changedParks.filter((p) => !p.deletedAt),

    deleted: changedParks.filter((p) => p.deletedAt).map((p) => p.id),
  });
}
