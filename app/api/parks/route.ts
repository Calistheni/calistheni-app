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
  console.time("count");

  const count = await prisma.park.count();

  console.timeEnd("count");
  console.log("total parks:", count);

  console.time("query");

  const parks = await prisma.park.findMany({
    select: {
      id: true,
      lat: true,
      lon: true,
    },
  });

  console.timeEnd("query");

  return NextResponse.json(
    parks.map((park) => ({
      ...park,
      name: "",
      address: "",
    }))
  );
}
