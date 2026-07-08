import "server-only";

import type { RewardTransactionType } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

type RewardPointMutationInput = {
  userId: string;
  points: number;
  description: string;
  referenceId?: string | null;
};

type AwardRewardPointsInput = RewardPointMutationInput & {
  type: Exclude<RewardTransactionType, "REDEMPTION">;
};

type DeductRewardPointsInput = RewardPointMutationInput & {
  type?: Extract<RewardTransactionType, "ADMIN" | "REDEMPTION">;
};

function parsePositivePoints(points: number) {
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("Reward points must be a positive integer.");
  }

  return points;
}

export async function awardRewardPoints({
  userId,
  type,
  points,
  description,
  referenceId = null,
}: AwardRewardPointsInput) {
  const finalPoints = parsePositivePoints(points);

  return prisma.$transaction(async (tx) => {
    const [transaction, user] = await Promise.all([
      tx.rewardTransaction.create({
        data: {
          userId,
          type,
          points: finalPoints,
          description,
          referenceId,
        },
      }),
      tx.user.update({
        where: {
          id: userId,
        },
        data: {
          rewardPoints: {
            increment: finalPoints,
          },
        },
        select: {
          id: true,
          rewardPoints: true,
        },
      }),
    ]);

    return {
      transaction,
      rewardPoints: user.rewardPoints,
    };
  });
}

export async function deductRewardPoints({
  userId,
  type = "REDEMPTION",
  points,
  description,
  referenceId = null,
}: DeductRewardPointsInput) {
  const finalPoints = parsePositivePoints(points);

  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.user.updateMany({
      where: {
        id: userId,
        rewardPoints: {
          gte: finalPoints,
        },
      },
      data: {
        rewardPoints: {
          decrement: finalPoints,
        },
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("Not enough reward points.");
    }

    const [transaction, user] = await Promise.all([
      tx.rewardTransaction.create({
        data: {
          userId,
          type,
          points: -finalPoints,
          description,
          referenceId,
        },
      }),
      tx.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          id: true,
          rewardPoints: true,
        },
      }),
    ]);

    return {
      transaction,
      rewardPoints: user.rewardPoints,
    };
  });
}
