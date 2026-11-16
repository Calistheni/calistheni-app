import "server-only";

import { FoodContributionStatus, FoodType, Prisma } from "@/lib/generated/prisma/client";

/** The single visibility policy for canonical Nutrition foods. */
export function nutritionFoodVisibilityWhere(userId: string): Prisma.FoodWhereInput {
  return {
    OR: [
      { type: { not: FoodType.USER_CREATED }, contributionStatus: null },
      { contributionStatus: FoodContributionStatus.APPROVED },
      { contributionStatus: FoodContributionStatus.PENDING, createdByUserId: userId },
    ],
  };
}

export function canUseNutritionFood(food: { type: FoodType; contributionStatus: FoodContributionStatus | null; createdByUserId: string | null }, userId: string) {
  if (food.contributionStatus === FoodContributionStatus.PENDING) return food.createdByUserId === userId;
  if (food.contributionStatus === FoodContributionStatus.REJECTED) return false;
  if (food.type !== FoodType.USER_CREATED) return food.contributionStatus === null || food.contributionStatus === FoodContributionStatus.APPROVED;
  return food.contributionStatus === FoodContributionStatus.APPROVED;
}
