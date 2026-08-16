import "server-only";

import {
  FoodContributionStatus,
  FoodType,
  Prisma,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const foodContributionFilters = [
  "ALL",
  FoodContributionStatus.PENDING,
  FoodContributionStatus.APPROVED,
  FoodContributionStatus.REJECTED,
] as const;

export type FoodContributionFilter = (typeof foodContributionFilters)[number];

const contributionInclude = {
  aliases: { select: { name: true } },
  servings: { select: { name: true, grams: true } },
  sourceRecords: {
    where: { source: "USER" },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { rawData: true, createdAt: true },
  },
  createdByUser: { select: { id: true, name: true, email: true } },
} satisfies Prisma.FoodInclude;

type ContributionRecord = Prisma.FoodGetPayload<{
  include: typeof contributionInclude;
}>;

function decimalValue(value: Prisma.Decimal | null) {
  return value?.toString() ?? null;
}

function proposalFromRawData(rawData: Prisma.JsonValue | null) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    return null;
  }

  const record = rawData as Record<string, unknown>;
  const proposal = record.proposal;
  if (proposal && typeof proposal === "object" && !Array.isArray(proposal)) {
    return proposal as Record<string, unknown>;
  }

  // Barcode contributions persist their canonical proposal directly in
  // FoodSourceRecord.rawData. Older generic submissions wrap it in `proposal`.
  // Support both exact persisted shapes without inferring any metadata.
  return typeof record.kind === "string" ? record : null;
}

function nutritionFromProposal(
  proposal: Record<string, unknown> | null,
  food: ContributionRecord
) {
  const nutrition = proposal?.nutrition;
  const values = nutrition && typeof nutrition === "object" && !Array.isArray(nutrition)
    ? nutrition as Record<string, unknown>
    : null;
  const stringOrFallback = (key: string, fallback: Prisma.Decimal | null) => {
    const value = values?.[key];
    return typeof value === "number" || typeof value === "string"
      ? String(value)
      : decimalValue(fallback);
  };
  return {
    nutritionBasisGrams: 100,
    caloriesKcal: stringOrFallback("caloriesKcal", food.caloriesKcal),
    proteinGrams: stringOrFallback("proteinGrams", food.proteinGrams),
    carbohydrateGrams: stringOrFallback("carbohydrateGrams", food.carbohydrateGrams),
    fatGrams: stringOrFallback("fatGrams", food.fatGrams),
  };
}

function serializeContribution(
  food: ContributionRecord,
  mergedFood: { id: string; name: string } | null
) {
  const sourceRecord = food.sourceRecords[0] ?? null;
  const submittedProposal = proposalFromRawData(sourceRecord?.rawData ?? null);
  return {
    id: food.id,
    name: food.name,
    barcode: food.barcode ? String(food.barcode) : null,
    brandName: food.brandName,
    contributionKind: submittedProposal?.kind === "BARCODE_PRODUCT" ? "BARCODE_PRODUCT" as const : "GENERIC_FOOD" as const,
    submissionMethod: typeof submittedProposal?.method === "string" ? submittedProposal.method : null,
    status: food.contributionStatus ?? FoodContributionStatus.PENDING,
    createdAt: food.createdAt.toISOString(),
    reviewedAt: food.reviewedAt?.toISOString() ?? null,
    reviewedByAdminLabel: food.reviewedByAdminLabel,
    rejectionReason: food.rejectionReason,
    confidenceScore: food.confidenceScore.toString(),
    nutritionBasisGrams: food.nutritionBasisGrams.toString(),
    caloriesKcal: decimalValue(food.caloriesKcal),
    proteinGrams: decimalValue(food.proteinGrams),
    carbohydrateGrams: decimalValue(food.carbohydrateGrams),
    fatGrams: decimalValue(food.fatGrams),
    aliases: food.aliases,
    servings: food.servings.map((serving) => ({
      name: serving.name,
      grams: serving.grams.toString(),
    })),
    createdByUser: food.createdByUser,
    submittedAt: sourceRecord?.createdAt.toISOString() ?? food.createdAt.toISOString(),
    submittedProposal,
    submittedNutrition: nutritionFromProposal(submittedProposal, food),
    approvedFood:
      food.contributionStatus === FoodContributionStatus.APPROVED
        ? { id: food.id, name: food.name }
        : null,
    mergedIntoFood: mergedFood,
  };
}

export async function getFoodContributionHistory({
  status = FoodContributionStatus.PENDING,
  limit = 50,
  cursor,
}: {
  status?: FoodContributionFilter;
  limit?: number;
  cursor?: string | null;
} = {}) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const where: Prisma.FoodWhereInput = {
    type: FoodType.USER_CREATED,
    contributionStatus:
      status === "ALL" ? { in: Object.values(FoodContributionStatus) } : status,
  };
  const orderBy: Prisma.FoodOrderByWithRelationInput =
    status === FoodContributionStatus.PENDING
      ? { createdAt: "asc" }
      : { updatedAt: "desc" };

  const [rows, groupedCounts] = await Promise.all([
    prisma.food.findMany({
      where,
      include: contributionInclude,
      orderBy,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: safeLimit + 1,
    }),
    prisma.food.groupBy({
      by: ["contributionStatus"],
      where: {
        type: FoodType.USER_CREATED,
        contributionStatus: { in: Object.values(FoodContributionStatus) },
      },
      _count: { _all: true },
    }),
  ]);

  const hasMore = rows.length > safeLimit;
  const page = hasMore ? rows.slice(0, safeLimit) : rows;
  const mergedIds = [...new Set(page.map((food) => food.mergedIntoFoodId).filter(Boolean))] as string[];
  const mergedFoods = mergedIds.length
    ? await prisma.food.findMany({
        where: { id: { in: mergedIds } },
        select: { id: true, name: true },
      })
    : [];
  const mergedById = new Map(mergedFoods.map((food) => [food.id, food]));
  const counts = Object.fromEntries(
    Object.values(FoodContributionStatus).map((value) => [value, 0])
  ) as Record<FoodContributionStatus, number>;
  for (const group of groupedCounts) {
    if (group.contributionStatus) counts[group.contributionStatus] = group._count._all;
  }

  return {
    foods: page.map((food) =>
      serializeContribution(
        food,
        food.mergedIntoFoodId
          ? mergedById.get(food.mergedIntoFoodId) ?? null
          : null
      )
    ),
    counts,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}
