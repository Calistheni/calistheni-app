import { getParkDetail } from "@/lib/parks";
import { prisma } from "@/lib/prisma";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import { parkMutationSchema } from "@/lib/validation/parks";
import { NextResponse } from "next/server";

export async function GET() {
  const parks = await prisma.park.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      title: true,
      address: true,
      lat: true,
      lon: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
  return NextResponse.json(parks);
}
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

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

  const park = await prisma.park.create({
    data: {
      name: parsedBody.data.name,
      title: parsedBody.data.title,
      address: parsedBody.data.address,
      lat: parsedBody.data.lat,
      lon: parsedBody.data.lon,

      equipment: {
        create: parsedBody.data.equipmentIds.map((equipmentId) => ({
          equipmentId,
        })),
      },
    },
  });

  const createdPark = await getParkDetail(park.id);

  return NextResponse.json(createdPark, { status: 201 });
}
