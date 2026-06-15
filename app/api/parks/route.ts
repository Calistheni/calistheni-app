import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
