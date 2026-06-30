import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { publicParkWhere } from "@/lib/parks";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const count = await prisma.park.count({
      where: {
        ...publicParkWhere,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
