import "server-only";

import { prisma } from "@/lib/prisma";
import {
  addNutritionDays,
  nutritionDateFromKey,
  nutritionDateKeyFromLocalDate,
} from "@/lib/nutrition/date-navigation";
import { nutritionDate } from "@/lib/nutrition/log";
import {
  calculateNutritionGoalProgress,
  resolveNutritionGoalForDate,
  type NutritionDailyTotals,
  type NutritionGoalValues,
  numberOrZero,
} from "@/lib/nutrition/goals";

type GoalRecord = NutritionGoalValues & { effectiveFrom: Date };

function serializeGoal(goal: GoalRecord) {
  return {
    caloriesKcal: goal.caloriesKcal,
    proteinGrams: goal.proteinGrams,
    carbohydrateGrams: goal.carbohydrateGrams,
    fatGrams: goal.fatGrams,
    effectiveFrom: nutritionDateKeyFromLocalDate(goal.effectiveFrom),
  };
}

function totalsFromAggregate(
  sum: Record<string, unknown> | null | undefined = undefined
): NutritionDailyTotals {
  return {
    caloriesKcal: numberOrZero(sum?.caloriesKcalSnapshot),
    proteinGrams: numberOrZero(sum?.proteinGramsSnapshot),
    carbohydrateGrams: numberOrZero(sum?.carbohydrateGramsSnapshot),
    fatGrams: numberOrZero(sum?.fatGramsSnapshot),
  };
}

function goalForDate(goals: GoalRecord[], dateKey: string) {
  const dateKeyGoals = goals.map((goal) => ({
    ...goal,
    effectiveFrom: nutritionDateKeyFromLocalDate(goal.effectiveFrom),
  }));
  const resolved = resolveNutritionGoalForDate(dateKeyGoals, dateKey);
  return resolved
    ? { ...resolved, effectiveFrom: nutritionDate(resolved.effectiveFrom) }
    : null;
}

export async function getNutritionGoalForDate(userId: string, dateKey: string) {
  const goal = await prisma.nutritionGoal.findFirst({
    where: { userId, effectiveFrom: { lte: nutritionDate(dateKey) } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      caloriesKcal: true,
      proteinGrams: true,
      carbohydrateGrams: true,
      fatGrams: true,
      effectiveFrom: true,
    },
  });
  if (!goal) return null;
  return serializeGoal({
    caloriesKcal: Number(goal.caloriesKcal),
    proteinGrams: Number(goal.proteinGrams),
    carbohydrateGrams: Number(goal.carbohydrateGrams),
    fatGrams: Number(goal.fatGrams),
    effectiveFrom: goal.effectiveFrom,
  });
}

/** One aggregate query supplies every visible day; immutable snapshots are authoritative. */
export async function getNutritionCalendarProgress(
  userId: string,
  startDateKey: string,
  endDateKey: string
) {
  const endExclusive = addNutritionDays(endDateKey, 1);
  const [dailySums, goals] = await Promise.all([
    prisma.nutritionEntrySnapshot.groupBy({
      by: ["loggedFor"],
      where: {
        userId,
        loggedFor: {
          gte: nutritionDate(startDateKey),
          lt: nutritionDate(endExclusive),
        },
      },
      _sum: {
        caloriesKcalSnapshot: true,
        proteinGramsSnapshot: true,
        carbohydrateGramsSnapshot: true,
        fatGramsSnapshot: true,
      },
    }),
    prisma.nutritionGoal.findMany({
      where: { userId, effectiveFrom: { lte: nutritionDate(endDateKey) } },
      orderBy: { effectiveFrom: "asc" },
      select: {
        caloriesKcal: true,
        proteinGrams: true,
        carbohydrateGrams: true,
        fatGrams: true,
        effectiveFrom: true,
      },
    }),
  ]);

  const goalRecords: GoalRecord[] = goals.map((goal) => ({
    caloriesKcal: Number(goal.caloriesKcal),
    proteinGrams: Number(goal.proteinGrams),
    carbohydrateGrams: Number(goal.carbohydrateGrams),
    fatGrams: Number(goal.fatGrams),
    effectiveFrom: goal.effectiveFrom,
  }));
  const totalsByDate = new Map(
    dailySums.map((sum) => [
      nutritionDateKeyFromLocalDate(sum.loggedFor),
      totalsFromAggregate(sum._sum),
    ])
  );
  const days: Record<string, unknown> = {};
  for (
    let dateKey = startDateKey;
    dateKey <= endDateKey;
    dateKey = addNutritionDays(dateKey, 1)
  ) {
    const goal = goalForDate(goalRecords, dateKey);
    if (!goal) continue;
    const totals = totalsByDate.get(dateKey) ?? totalsFromAggregate();
    days[dateKey] = {
      totals,
      goal: serializeGoal(goal),
      ...calculateNutritionGoalProgress(totals, goal),
    };
  }
  return { days };
}

export function monthCalendarRange(monthKey: string) {
  const monthDate = nutritionDateFromKey(`${monthKey}-01`);
  const start = new Date(monthDate);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const end = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
    12
  );
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  return {
    startDateKey: nutritionDateKeyFromLocalDate(start),
    endDateKey: nutritionDateKeyFromLocalDate(end),
  };
}
