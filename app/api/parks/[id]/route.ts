import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const park = await prisma.park.findUnique({
    where: {
      id: Number(id),
    },
    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
  });

  if (!park) {
    return NextResponse.json({ error: "Park not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    equipment: park.equipment.map((relation) => relation.equipment.name),
  });
}
