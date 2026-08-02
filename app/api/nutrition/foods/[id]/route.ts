import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { localFoodDetail } from "@/lib/nutrition/food-detail";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAuthenticatedUserId())) return createUserUnauthorizedResponse();
  try {
    const food = await prisma.food.findUnique({ where: { id: (await params).id }, include: { aliases: { select: { name: true } }, servings: true, details: true, nutrients: true, currentRevision: { select: { id: true, revisionNumber: true } } } });
    if (!food) return createJsonErrorResponse("Food not found.", 404);
    return NextResponse.json(localFoodDetail(food));
  } catch (error) {
    console.error("NUTRITION_FOOD_LOAD_FAILED", { error });
    return createInternalServerErrorResponse();
  }
}
