import { getParkDetail } from "@/lib/parks";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parkMutationSchema } from "@/lib/validation/parks";
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
  const parkId = Number(id);

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsedBody = parkMutationSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid park payload.",
        fieldErrors: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.park.update({
      where: {
        id: parkId,
      },
      data: {
        name: parsedBody.data.name,
        title: parsedBody.data.title,
        address: parsedBody.data.address,
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,
      },
    });

    await tx.parkEquipment.deleteMany({
      where: {
        parkId,
      },
    });

    if (parsedBody.data.equipmentIds.length) {
      await tx.parkEquipment.createMany({
        data: parsedBody.data.equipmentIds.map((equipmentId) => ({
          parkId,
          equipmentId,
        })),
      });
    }
  });

  const updatedPark = await getParkDetail(parkId);

  return NextResponse.json(updatedPark);
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
