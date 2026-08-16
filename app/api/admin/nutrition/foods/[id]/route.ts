import { NextResponse } from "next/server";
import { z } from "zod";
import { FoodContributionStatus, FoodRevisionReason, FoodSource, FoodVerificationStatus } from "@/lib/generated/prisma/client";
import { createInternalServerErrorResponse, createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, getAdminActorLabel, isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ action: z.enum(["approve", "reject"]), name: z.string().trim().min(2).max(120).optional(), caloriesKcal: z.number().min(0).max(2000).optional(), proteinGrams: z.number().min(0).max(200).optional(), carbohydrateGrams: z.number().min(0).max(300).optional(), fatGrams: z.number().min(0).max(200).optional(), rejectionReason: z.string().trim().min(2).max(500).nullable().optional() }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return createJsonValidationErrorResponse("Invalid moderation update.", parsed.error.flatten().fieldErrors);
  const id = (await params).id;
  try {
    const food = await prisma.food.findFirst({ where: { id, contributionStatus: FoodContributionStatus.PENDING }, include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } } });
    if (!food) return createJsonErrorResponse("Pending contribution not found.", 404);
    const approved = parsed.data.action === "approve";
    const edits = { name: parsed.data.name ?? food.name, caloriesKcal: parsed.data.caloriesKcal ?? food.caloriesKcal, proteinGrams: parsed.data.proteinGrams ?? food.proteinGrams, carbohydrateGrams: parsed.data.carbohydrateGrams ?? food.carbohydrateGrams, fatGrams: parsed.data.fatGrams ?? food.fatGrams };
    const status = approved ? FoodContributionStatus.APPROVED : FoodContributionStatus.REJECTED;
    const verificationStatus = approved ? FoodVerificationStatus.COMMUNITY_REVIEWED : FoodVerificationStatus.DISPUTED;
    const reviewedAt = new Date();
    const reviewedByAdminLabel = await getAdminActorLabel();
    const rejectionReason = approved ? null : parsed.data.rejectionReason ?? null;
    const updated = await prisma.$transaction(async (tx) => {
      if (approved && (parsed.data.name || parsed.data.caloriesKcal !== undefined || parsed.data.proteinGrams !== undefined || parsed.data.carbohydrateGrams !== undefined || parsed.data.fatGrams !== undefined)) {
        const revision = await tx.foodRevision.create({ data: { foodId: food.id, revisionNumber: (food.revisions[0]?.revisionNumber ?? 0) + 1, reason: FoodRevisionReason.ADMIN_CORRECTION, source: FoodSource.CALISTHENI, sourceExternalId: food.sourceExternalId, name: edits.name, barcode: food.barcode, nutritionBasisGrams: 100, caloriesKcal: edits.caloriesKcal, proteinGrams: edits.proteinGrams, carbohydrateGrams: edits.carbohydrateGrams, fatGrams: edits.fatGrams, confidenceScore: 0.9, verificationStatus, normalizedDataChecksum: `admin:${Date.now()}` } });
        return tx.food.update({ where: { id: food.id }, data: { ...edits, contributionStatus: status, verificationStatus, currentRevisionId: revision.id, reviewedAt, reviewedByAdminLabel, rejectionReason } });
      }
      return tx.food.update({ where: { id: food.id }, data: { contributionStatus: status, verificationStatus, reviewedAt, reviewedByAdminLabel, rejectionReason } });
    });
    return NextResponse.json({ food: updated });
  } catch (error) { console.error("ADMIN_FOOD_CONTRIBUTION_MODERATE_FAILED", error); return createInternalServerErrorResponse(); }
}
