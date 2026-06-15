import { getParkDetail } from "@/lib/parks";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  console.time("route");

  const { id } = await params;

  const park = await getParkDetail(Number(id));

  console.timeEnd("route");

  if (!park) {
    return NextResponse.json({ error: "Park not found" }, { status: 404 });
  }

  return NextResponse.json(park);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = await request.json();

  const park = await prisma.park.update({
    where: {
      id: Number(id),
    },
    data: {
      name: body.name,
      title: body.title,
      address: body.address,
      lat: body.lat,
      lon: body.lon,
    },
  });

  return NextResponse.json(park);
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.park.update({
    where: {
      id: Number(id),
    },
    data: {
      deletedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
  });
}
