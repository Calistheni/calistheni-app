import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const latestPark = await prisma.park.findFirst({
      where: {
        deletedAt: null,
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
