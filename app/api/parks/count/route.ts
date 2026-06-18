import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const count = await prisma.park.count({
    where: {
      deletedAt: null,
    },
  });

  return NextResponse.json({ count });
}
