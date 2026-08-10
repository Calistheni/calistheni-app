import { NextResponse } from "next/server";
import { FoodContributionStatus, FoodType } from "@/lib/generated/prisma/client";
import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  const status = new URL(request.url).searchParams.get("status") ?? "PENDING";
  if (!(Object.values(FoodContributionStatus) as string[]).includes(status)) return createJsonErrorResponse("Invalid contribution status.", 400);
  try {
    const foods = await prisma.food.findMany({
      where: { type: FoodType.USER_CREATED, contributionStatus: status as FoodContributionStatus },
      include: { aliases: { select: { name: true } }, servings: { select: { name: true, grams: true } }, sourceRecords: { orderBy: { createdAt: "desc" }, take: 1 }, createdByUser: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ foods });
  } catch (error) { console.error("ADMIN_FOOD_CONTRIBUTIONS_LIST_FAILED", error); return createInternalServerErrorResponse(); }
}
