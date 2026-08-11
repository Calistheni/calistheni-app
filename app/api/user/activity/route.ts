import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

// Account presence only. The client calls this once per visible app session and
// the database write is throttled server-side to avoid click/request tracking.
const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastActiveAt: true } });
  if (!user) return createUserUnauthorizedResponse();
  const now = new Date();
  if (!user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() >= HEARTBEAT_INTERVAL_MS) {
    await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
  }
  return NextResponse.json({ ok: true });
}
