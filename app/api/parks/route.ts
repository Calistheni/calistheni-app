import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const parks = await prisma.park.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      address: true,
      lat: true,
      lon: true,
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

      equipment: {
        create: (body.equipmentIds ?? []).map((equipmentId: number) => ({
          equipmentId,
        })),
      },
    },

    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
  });

  return NextResponse.json(park, { status: 201 });
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

  return NextResponse.json({ success: true });
}
