import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { nutritionAiDailyLimit, type NutritionAiFeature } from "./ai-limits";

type UsageRow = { describeCount: number; aiScanCount: number };
type QuotaReservation = { userId: string; date: Date; feature: NutritionAiFeature; limit: number };
export type NutritionAiQuota = { used: number; remaining: number; limit: number };

/** UTC day boundaries make counters stable across server regions and DST. */
export function nutritionAiUsageDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function counter(feature: NutritionAiFeature) { return feature === "describe" ? "describeCount" : "aiScanCount" as const; }
function quotaFrom(row: UsageRow | null, feature: NutritionAiFeature, isPro: boolean): NutritionAiQuota {
  const limit = nutritionAiDailyLimit(feature, isPro);
  const used = row?.[counter(feature)] ?? 0;
  return { used, remaining: Math.max(0, limit - used), limit };
}

export async function getNutritionAiQuotas(userId: string, isPro: boolean, now = new Date()) {
  const row = await prisma.nutritionAiUsage.findUnique({ where: { userId_date: { userId, date: nutritionAiUsageDate(now) } }, select: { describeCount: true, aiScanCount: true } });
  return { describe: quotaFrom(row, "describe", isPro), aiScan: isPro ? quotaFrom(row, "aiScan", true) : null };
}

/**
 * Reserve one slot before calling OpenAI. Serializable retry prevents two
 * concurrent requests from both spending the final daily slot. Call release
 * when the provider fails; a successful provider response retains the slot.
 */
export async function reserveNutritionAiQuota(userId: string, isPro: boolean, feature: NutritionAiFeature, now = new Date()): Promise<QuotaReservation | null> {
  const date = nutritionAiUsageDate(now);
  const limit = nutritionAiDailyLimit(feature, isPro);
  const field = counter(feature);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const reserved = await prisma.$transaction(async (tx) => {
        const existing = await tx.nutritionAiUsage.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date },
          update: {},
          select: { describeCount: true, aiScanCount: true },
        });
        if (existing[field] >= limit) return false;
        await tx.nutritionAiUsage.update({ where: { userId_date: { userId, date } }, data: { [field]: { increment: 1 } } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return reserved ? { userId, date, feature, limit } : null;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  return null;
}

export async function releaseNutritionAiQuota(reservation: QuotaReservation) {
  const field = counter(reservation.feature);
  await prisma.nutritionAiUsage.updateMany({
    where: { userId: reservation.userId, date: reservation.date, [field]: { gt: 0 } },
    data: { [field]: { decrement: 1 } },
  });
}
