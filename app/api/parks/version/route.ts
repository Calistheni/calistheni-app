import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { publicParkWhere } from "@/lib/parks";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const latestPark = await prisma.park.findFirst({
      where: {
        ...publicParkWhere,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        updatedAt: true,
      },
    });

    return NextResponse.json({
      version: latestPark?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
