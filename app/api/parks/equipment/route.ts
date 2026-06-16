import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const equipment = await prisma.equipment.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json(equipment);
}
