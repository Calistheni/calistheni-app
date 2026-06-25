import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const equipment = await prisma.equipment.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(equipment);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
