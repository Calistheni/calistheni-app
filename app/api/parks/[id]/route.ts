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

  const parkId = Number(id);

  const park = await prisma.$transaction(async (tx) => {
    await tx.park.update({
      where: {
        id: parkId,
      },
      data: {
        name: body.name,
        title: body.title,
        address: body.address,
        lat: body.lat,
        lon: body.lon,
      },
    });

    await tx.parkEquipment.deleteMany({
      where: {
        parkId,
      },
    });

    if (body.equipmentIds?.length) {
      await tx.parkEquipment.createMany({
        data: body.equipmentIds.map((equipmentId: number) => ({
          parkId,
          equipmentId,
        })),
      });
    }

    return tx.park.findUnique({
      where: {
        id: parkId,
      },
    });
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
