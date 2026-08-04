import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfWeekMonday } from "@/lib/progress";
import { buildDailySupplementCalendarStates, isSupplementExpectedOn, utcDay } from "@/lib/supplement-calendar";

export async function getSupplementAdherence(userId: string, start: Date, end: Date) {
  const plans = await prisma.userSupplementPlan.findMany({ where: { userId, createdAt: { lt: end } }, include: { supplementDefinition: true, logs: { where: { scheduledFor: { gte: start, lt: end } } } } });
  return plans.map((plan) => { let scheduled = 0; let completed = 0; for (let day = utcDay(start); day < end; day = new Date(day.getTime() + 86400000)) { if (isSupplementExpectedOn(plan, day)) { scheduled++; if (plan.logs.some((log) => log.scheduledFor.getTime() === day.getTime())) completed++; } } return { planId: plan.id, name: plan.supplementDefinition?.name ?? plan.customName ?? "Supplement", scheduled, completed, percentage: scheduled ? Math.round(completed / scheduled * 100) : null }; });
}

/** Bounded, authenticated-user-only adherence data for the private home calendar. */
export async function getDailySupplementCalendarAdherence(userId: string, start: Date, end: Date) {
  const plans = await prisma.userSupplementPlan.findMany({
    where: { userId, createdAt: { lt: end }, OR: [{ archivedAt: null }, { archivedAt: { gt: start } }] },
    select: {
      frequency: true,
      weekdays: true,
      everyNDays: true,
      createdAt: true,
      archivedAt: true,
      logs: {
        where: { scheduledFor: { gte: start, lt: end } },
        select: { scheduledFor: true, completedAt: true, dosageSnapshot: true, unitSnapshot: true, supplementNameSnapshot: true },
      },
    },
  });
  const calendarPlans = plans.map((plan) => ({
    ...plan,
    logs: plan.logs.map((log) => ({
      scheduledFor: log.scheduledFor,
      completedAt: log.completedAt,
      dosage: log.dosageSnapshot?.toString() ?? null,
      unit: log.unitSnapshot,
      name: log.supplementNameSnapshot,
    })),
  }));
  return { hasPlans: plans.length > 0, states: buildDailySupplementCalendarStates(calendarPlans, start, end) };
}

export async function getSupplementDashboard(userId: string, now = new Date()) {
  const weekStart = startOfWeekMonday(now); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [week, month] = await Promise.all([getSupplementAdherence(userId, weekStart, new Date(weekStart.getTime() + 7 * 86400000)), getSupplementAdherence(userId, monthStart, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)))]);
  const sum = (items: typeof week) => ({ scheduled: items.reduce((n, item) => n + item.scheduled, 0), completed: items.reduce((n, item) => n + item.completed, 0) });
  return { week: { items: week, ...sum(week) }, month: { items: month, ...sum(month) } };
}
