import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const count = await prisma.park.count({
      where: {
        deletedAt: null,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
