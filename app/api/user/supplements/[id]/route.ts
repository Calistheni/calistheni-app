import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { supplementPlanSchema } from "@/lib/progress";

async function ownedPlan(id: string, userId: string) {
  return prisma.userSupplementPlan.findFirst({ where: { id, userId }, select: { id: true, _count: { select: { logs: true } } } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  const { id } = await params; let body: unknown;
  try { body = await request.json(); } catch { return createJsonErrorResponse("Invalid JSON payload.", 400); }
  const parsed = supplementPlanSchema.safeParse(body);
  if (!parsed.success) return createJsonValidationErrorResponse("Invalid supplement plan.", parsed.error.flatten().fieldErrors);
  if (!(await ownedPlan(id, userId))) return createJsonErrorResponse("Supplement plan not found.", 404);
  if (parsed.data.supplementDefinitionId && !(await prisma.supplementDefinition.findUnique({ where: { id: parsed.data.supplementDefinitionId } }))) return createJsonErrorResponse("Supplement not found.", 404);
  try { return NextResponse.json(await prisma.userSupplementPlan.update({ where: { id }, data: parsed.data, include: { supplementDefinition: true } })); } catch (error) { console.error(error); return createInternalServerErrorResponse(); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); const { id } = await params;
  const action = new URL(request.url).searchParams.get("action"); const plan = await ownedPlan(id, userId); if (!plan) return createJsonErrorResponse("Supplement plan not found.", 404);
  if (action === "archive") await prisma.userSupplementPlan.update({ where: { id }, data: { isActive: false, archivedAt: new Date() } });
  else if (action === "restore") await prisma.userSupplementPlan.update({ where: { id }, data: { isActive: true, archivedAt: null } });
  else return createJsonErrorResponse("Unsupported supplement action.", 400);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); const { id } = await params; const plan = await ownedPlan(id, userId); if (!plan) return createJsonErrorResponse("Supplement plan not found.", 404);
  if (plan._count.logs) return createJsonErrorResponse("Plans with completion history are kept as archived history.", 409);
  await prisma.userSupplementPlan.delete({ where: { id } }); return NextResponse.json({ ok: true });
}
