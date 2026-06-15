import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const parks = await prisma.park.findMany({
    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json(parks);
}
export async function POST(request: Request) {
  const body = await request.json();

  const park = await prisma.park.create({
    data: {
      name: body.name,
      title: body.title ?? null,
      address: body.address ?? null,
      lat: Number(body.lat),
      lon: Number(body.lon),
    },
  });

  return NextResponse.json(park, { status: 201 });
}
