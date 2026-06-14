import { getParksInBounds } from "@/lib/parks";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function parseBounds(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const parks = await prisma.park.findMany({
    select: {
      id: true,
      lat: true,
      lon: true,
    },
  });

  return NextResponse.json(parks);
}
