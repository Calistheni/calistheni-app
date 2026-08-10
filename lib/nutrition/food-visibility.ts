import "server-only";

import { FoodContributionStatus, FoodType, Prisma } from "@/lib/generated/prisma/client";

/** The single visibility policy for canonical Nutrition foods. */
export function nutritionFoodVisibilityWhere(userId: string): Prisma.FoodWhereInput {
  return {
    OR: [
      { type: { not: FoodType.USER_CREATED } },
      { type: FoodType.USER_CREATED, contributionStatus: FoodContributionStatus.APPROVED },
      { type: FoodType.USER_CREATED, contributionStatus: FoodContributionStatus.PENDING, createdByUserId: userId },
    ],
  };
}

export function canUseNutritionFood(food: { type: FoodType; contributionStatus: FoodContributionStatus | null; createdByUserId: string | null }, userId: string) {
  if (food.type !== FoodType.USER_CREATED) return true;
  return food.contributionStatus === FoodContributionStatus.APPROVED
    || (food.contributionStatus === FoodContributionStatus.PENDING && food.createdByUserId === userId);
}
