import "server-only";
import { prisma } from "@/lib/prisma";
import { isPlanScheduledOn, startOfWeekMonday } from "@/lib/progress";

export function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function isSupplementExpected(
  plan: { frequency: string; weekdays: number[]; everyNDays: number | null; createdAt: Date; archivedAt: Date | null },
  day: Date
) {
  return day >= utcDay(plan.createdAt) && (!plan.archivedAt || day < utcDay(plan.archivedAt)) && isPlanScheduledOn(plan, day);
}

export async function getSupplementAdherence(userId: string, start: Date, end: Date) {
  const plans = await prisma.userSupplementPlan.findMany({ where: { userId, createdAt: { lt: end } }, include: { supplementDefinition: true, logs: { where: { scheduledFor: { gte: start, lt: end } } } } });
  return plans.map((plan) => { let scheduled = 0; let completed = 0; for (let day = utcDay(start); day < end; day = new Date(day.getTime() + 86400000)) { if (isSupplementExpected(plan, day)) { scheduled++; if (plan.logs.some((log) => log.scheduledFor.getTime() === day.getTime())) completed++; } } return { planId: plan.id, name: plan.supplementDefinition?.name ?? plan.customName ?? "Supplement", scheduled, completed, percentage: scheduled ? Math.round(completed / scheduled * 100) : null }; });
}

export async function getSupplementDashboard(userId: string, now = new Date()) {
  const weekStart = startOfWeekMonday(now); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [week, month] = await Promise.all([getSupplementAdherence(userId, weekStart, new Date(weekStart.getTime() + 7 * 86400000)), getSupplementAdherence(userId, monthStart, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)))]);
  const sum = (items: typeof week) => ({ scheduled: items.reduce((n, item) => n + item.scheduled, 0), completed: items.reduce((n, item) => n + item.completed, 0) });
  return { week: { items: week, ...sum(week) }, month: { items: month, ...sum(month) } };
}
