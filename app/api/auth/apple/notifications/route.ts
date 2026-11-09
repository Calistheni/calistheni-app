import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { verifyAppleServerAccountEvent } from "@/lib/auth/apple";
import { applyVerifiedAppleAccountEvent } from "@/lib/auth/apple-account-events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
  if (typeof body?.payload !== "string" || body.payload.length > 16_384) {
    return NextResponse.json({ error: "Invalid notification." }, { status: 400 });
  }
  try {
    const event = await verifyAppleServerAccountEvent(body.payload);
    await applyVerifiedAppleAccountEvent(event);
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new NextResponse(null, { status: 200 });
    }
    console.error("[auth.apple] account notification rejected", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Invalid notification." }, { status: 400 });
  }
}
