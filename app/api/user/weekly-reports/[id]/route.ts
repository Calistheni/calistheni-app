import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); const { id } = await params;
  const report = await prisma.weeklyProgressReport.findFirst({ where: { id, userId } }); return report ? NextResponse.json(report) : createJsonErrorResponse("Report not found.", 404);
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); const { id } = await params;
  try { const body = await request.json() as { dismissAnnouncement?: boolean; viewed?: boolean }; const report = await prisma.weeklyProgressReport.updateMany({ where: { id, userId }, data: { viewedAt: body.viewed ? new Date() : undefined, announcementDismissedAt: body.dismissAnnouncement ? new Date() : undefined } }); return report.count ? NextResponse.json({ ok: true }) : createJsonErrorResponse("Report not found.", 404); } catch (error) { console.error(error); return createInternalServerErrorResponse(); }
}
