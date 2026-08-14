import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createJsonErrorResponse } from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ foodId: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { foodId } = await params;
  try {
    await prisma.nutritionSavedFood.delete({
      where: { userId_foodId: { userId, foodId } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return createJsonErrorResponse("Saved food was not found.", 404);
  }
}
