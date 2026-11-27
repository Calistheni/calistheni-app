import { NextResponse } from "next/server";
import { getDatabaseSessionFromRequest } from "@/lib/auth/database-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const session = await getDatabaseSessionFromRequest(request);
    if (!session) return new Response(null, { status: 401, headers });

    const account = await prisma.appleBillingAccount.findUnique({
      where: { userId: session.userId },
      select: { appAccountToken: true },
    });

    return NextResponse.json(
      { appAccountToken: account?.appAccountToken ?? null },
      { headers }
    );
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
