import { NextResponse } from "next/server";
import { createJsonErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return createJsonErrorResponse("Invalid workout id.", 400);
  }

  const updated = await prisma.workout.updateMany({
    where: { id, userId, completedAt: { not: null }, appleHealthExportedAt: null },
    data: { appleHealthExportedAt: new Date() },
  });
  return NextResponse.json({ exported: updated.count === 1 });
}
