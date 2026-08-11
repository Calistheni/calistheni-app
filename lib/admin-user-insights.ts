import "server-only";

import { FoodContributionStatus, Prisma, SubscriptionPlan, SubscriptionStatus, UserActivityEventType } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const adminUserFilters = [
  "ALL",
  "FREE",
  "PRO",
  "LIFETIME",
  "RECENTLY_ACTIVE",
  "INACTIVE",
  "HAS_WORKOUTS",
  "HAS_NUTRITION",
  "HAS_PARKS",
  "PENDING_FOODS",
] as const;

export type AdminUserFilter = (typeof adminUserFilters)[number];

const RECENT_ACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;

export type AdminUserListItem = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  username: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
  plan: "FREE" | "PRO" | "LIFETIME";
  subscriptionStatus: string | null;
  workoutsCount: number;
  nutritionEntriesCount: number;
  parksCount: number;
  foodContributionsCount: number;
  pendingFoodContributionsCount: number;
};

function planFor(subscription: { plan: SubscriptionPlan; status: SubscriptionStatus; lifetimePurchasedAt: Date | null } | null) {
  if (!subscription) return "FREE" as const;
  if (subscription.plan === SubscriptionPlan.PRO_LIFETIME || subscription.lifetimePurchasedAt) return "LIFETIME" as const;
  return subscription.plan !== SubscriptionPlan.FREE && (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.TRIALING) ? "PRO" as const : "FREE" as const;
}

function serializeUser(user: {
  id: string; name: string | null; email: string | null; image: string | null; username: string | null; createdAt: Date; updatedAt: Date; lastActiveAt: Date | null;
  subscription: { plan: SubscriptionPlan; status: SubscriptionStatus; lifetimePurchasedAt: Date | null } | null;
  _count: { workouts: number; nutritionEntrySnapshots: number; submittedParks: number; contributedFoods: number };
}) : AdminUserListItem {
  return {
    id: user.id, name: user.name, email: user.email, image: user.image, username: user.username,
    joinedAt: user.createdAt.toISOString(),
    // Existing accounts do not have a heartbeat yet. updatedAt is a conservative fallback
    // for support triage until the first authenticated heartbeat is recorded.
    lastActiveAt: (user.lastActiveAt ?? user.updatedAt).toISOString(),
    plan: planFor(user.subscription),
    subscriptionStatus: user.subscription?.status ?? null,
    workoutsCount: user._count.workouts,
    nutritionEntriesCount: user._count.nutritionEntrySnapshots,
    parksCount: user._count.submittedParks,
    foodContributionsCount: user._count.contributedFoods,
    pendingFoodContributionsCount: 0,
  };
}

function userWhere(filter: AdminUserFilter, search: string): Prisma.UserWhereInput {
  const clean = search.trim();
  const AND: Prisma.UserWhereInput[] = [];
  if (clean) {
    AND.push({ OR: [
      { id: { contains: clean, mode: "insensitive" } },
      { name: { contains: clean, mode: "insensitive" } },
      { email: { contains: clean, mode: "insensitive" } },
      { username: { contains: clean, mode: "insensitive" } },
    ] });
  }
  const recent = new Date(Date.now() - RECENT_ACTIVITY_MS);
  switch (filter) {
    case "FREE": AND.push({ OR: [{ subscription: null }, { subscription: { plan: SubscriptionPlan.FREE } }, { subscription: { status: { notIn: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } } }] }); break;
    case "PRO": AND.push({ subscription: { is: { plan: { in: [SubscriptionPlan.PRO_MONTHLY, SubscriptionPlan.PRO_YEARLY] }, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } } } }); break;
    case "LIFETIME": AND.push({ subscription: { is: { OR: [{ plan: SubscriptionPlan.PRO_LIFETIME }, { lifetimePurchasedAt: { not: null } }] } } }); break;
    case "RECENTLY_ACTIVE": AND.push({ lastActiveAt: { gte: recent } }); break;
    case "INACTIVE": AND.push({ OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: recent } }] }); break;
    case "HAS_WORKOUTS": AND.push({ workouts: { some: {} } }); break;
    case "HAS_NUTRITION": AND.push({ nutritionEntrySnapshots: { some: {} } }); break;
    case "HAS_PARKS": AND.push({ submittedParks: { some: {} } }); break;
    case "PENDING_FOODS": AND.push({ contributedFoods: { some: { contributionStatus: FoodContributionStatus.PENDING } } }); break;
  }
  return AND.length ? { AND } : {};
}

export async function getAdminUsers({ search = "", filter = "ALL", cursor }: { search?: string; filter?: AdminUserFilter; cursor?: string | null } = {}) {
  const where = userWhere(filter, search);
  const users = await prisma.user.findMany({
    where, orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }], cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : 0, take: PAGE_SIZE + 1,
    include: { subscription: { select: { plan: true, status: true, lifetimePurchasedAt: true } }, _count: { select: { workouts: true, nutritionEntrySnapshots: true, submittedParks: true, contributedFoods: true } } },
  });
  const page = users.slice(0, PAGE_SIZE);
  const pending = page.length ? await prisma.food.groupBy({ by: ["createdByUserId"], where: { createdByUserId: { in: page.map((user) => user.id) }, contributionStatus: FoodContributionStatus.PENDING }, _count: { _all: true } }) : [];
  const pendingByUser = new Map(pending.map((row) => [row.createdByUserId, row._count._all]));
  return { users: page.map((user) => ({ ...serializeUser(user), pendingFoodContributionsCount: pendingByUser.get(user.id) ?? 0 })), nextCursor: users.length > PAGE_SIZE ? page.at(-1)?.id ?? null : null };
}

export type AdminTimelineEvent = { id: string; type: string; title: string; detail: string | null; createdAt: string };

function number(value: Prisma.Decimal | number | null | undefined) { return value == null ? 0 : Number(value); }

function workoutVolume(exercises: Array<{ sets: Array<{ completed: boolean; reps: number | null; weight: number | null }> }>) {
  return exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed).reduce((total, set) => total + (set.reps ?? 0) * (set.weight ?? 0), 0);
}

export async function getAdminUserInsight(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true, _count: { select: { workouts: true, nutritionEntrySnapshots: true, nutritionSavedMeals: true, supplementPlans: true, submittedParks: true, contributedFoods: true, following: true, followers: true, personalRecords: true } } },
  });
  if (!user) return null;

  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const setWhere = { workoutExercise: { workout: { userId } } };
  const [setAggregate, nutritionLast7, nutritionDays7, nutritionDays30, aiAggregate, recentWorkouts, recentNutrition, supplements, supplementLogs, foods, parks, follows, records, aiDays, barcodeEvents, barcodeCount] = await Promise.all([
    prisma.workoutSet.aggregate({ where: setWhere, _count: { _all: true }, _sum: { reps: true } }),
    prisma.nutritionEntrySnapshot.aggregate({ where: { userId, loggedFor: { gte: since7 } }, _avg: { caloriesKcalSnapshot: true, proteinGramsSnapshot: true } }),
    prisma.nutritionEntrySnapshot.groupBy({ by: ["loggedFor"], where: { userId, loggedFor: { gte: since7 } } }),
    prisma.nutritionEntrySnapshot.groupBy({ by: ["loggedFor"], where: { userId, loggedFor: { gte: since30 } } }),
    prisma.nutritionAiUsage.aggregate({ where: { userId }, _sum: { aiScanCount: true, describeCount: true } }),
    prisma.workout.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 30, include: { exercises: { include: { exercise: { select: { name: true } }, sets: { select: { completed: true, reps: true, weight: true } } } }, personalRecords: { select: { id: true } } } }),
    prisma.nutritionEntrySnapshot.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, foodNameSnapshot: true, gramsConsumed: true, caloriesKcalSnapshot: true, proteinGramsSnapshot: true, carbohydrateGramsSnapshot: true, fatGramsSnapshot: true, mealCategory: true, sourceSnapshot: true, loggedFor: true, createdAt: true } }),
    prisma.userSupplementPlan.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 30, include: { supplementDefinition: { select: { name: true } } } }),
    prisma.supplementLog.findMany({ where: { plan: { userId } }, orderBy: { completedAt: "desc" }, take: 20, select: { id: true, supplementNameSnapshot: true, completedAt: true } }),
    prisma.food.findMany({ where: { createdByUserId: userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true, contributionStatus: true, confidenceScore: true, createdAt: true, reviewedAt: true, rejectionReason: true } }),
    prisma.park.findMany({ where: { submittedById: userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true, submissionStatus: true, createdAt: true, reviewedAt: true, rejectionReason: true } }),
    prisma.userFollow.findMany({ where: { followerId: userId }, orderBy: { createdAt: "desc" }, take: 30, include: { following: { select: { name: true, username: true } } } }),
    prisma.personalRecord.findMany({ where: { userId }, orderBy: { achievedAt: "desc" }, take: 50, include: { exercise: { select: { name: true } }, workout: { select: { id: true, title: true } } } }),
    prisma.nutritionAiUsage.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 30 }),
    prisma.userActivityEvent.findMany({ where: { userId, type: UserActivityEventType.BARCODE_LOOKUP }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, metadata: true, createdAt: true } }),
    prisma.userActivityEvent.count({ where: { userId, type: UserActivityEventType.BARCODE_LOOKUP } }),
  ]);

  const timeline: AdminTimelineEvent[] = [
    ...recentWorkouts.filter((workout) => workout.completedAt).map((workout) => ({ id: `workout-${workout.id}`, type: "WORKOUT_COMPLETED", title: "Completed workout", detail: `${workout.title ?? "Workout"} · ${workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0)} sets · ${Math.round(workoutVolume(workout.exercises)).toLocaleString()} kg volume`, createdAt: (workout.completedAt ?? workout.startedAt).toISOString() })),
    ...recentNutrition.map((entry) => ({ id: `nutrition-${entry.id}`, type: "NUTRITION_LOGGED", title: `Logged nutrition · ${entry.mealCategory.toLowerCase()}`, detail: `${entry.foodNameSnapshot} · ${number(entry.gramsConsumed)} g · ${Math.round(number(entry.caloriesKcalSnapshot))} kcal`, createdAt: entry.createdAt.toISOString() })),
    ...foods.flatMap((food) => [{ id: `food-submitted-${food.id}`, type: "FOOD_CONTRIBUTED", title: "Submitted food contribution", detail: food.name, createdAt: food.createdAt.toISOString() }, ...(food.reviewedAt ? [{ id: `food-reviewed-${food.id}`, type: "FOOD_REVIEWED", title: `Food contribution ${food.contributionStatus?.toLowerCase() ?? "reviewed"}`, detail: food.name, createdAt: food.reviewedAt.toISOString() }] : [])]),
    ...parks.flatMap((park) => [{ id: `park-submitted-${park.id}`, type: "PARK_SUBMITTED", title: "Submitted park", detail: park.name, createdAt: park.createdAt.toISOString() }, ...(park.reviewedAt ? [{ id: `park-reviewed-${park.id}`, type: "PARK_REVIEWED", title: `Park ${park.submissionStatus.toLowerCase()}`, detail: park.name, createdAt: park.reviewedAt.toISOString() }] : [])]),
    ...supplementLogs.map((log) => ({ id: `supplement-${log.id}`, type: "SUPPLEMENT_TAKEN", title: "Marked supplement taken", detail: log.supplementNameSnapshot, createdAt: log.completedAt.toISOString() })),
    ...follows.map((follow) => ({ id: `follow-${follow.followerId}-${follow.followingId}`, type: "USER_FOLLOWED", title: "Followed user", detail: follow.following.name ?? follow.following.username ?? "User", createdAt: follow.createdAt.toISOString() })),
    ...records.map((record) => ({ id: `record-${record.id}`, type: "PR_ACHIEVED", title: "Personal record", detail: `${record.exercise.name} · ${record.value}`, createdAt: record.achievedAt.toISOString() })),
    ...aiDays.filter((day) => day.aiScanCount || day.describeCount).map((day) => ({ id: `ai-${day.id}`, type: "AI_USAGE", title: "AI nutrition used", detail: [day.aiScanCount ? `${day.aiScanCount} AI scan${day.aiScanCount === 1 ? "" : "s"}` : null, day.describeCount ? `${day.describeCount} describe` : null].filter(Boolean).join(" · "), createdAt: day.updatedAt.toISOString() })),
    ...barcodeEvents.map((event) => ({ id: `barcode-${event.id}`, type: "BARCODE_LOOKUP", title: "Barcode lookup", detail: (event.metadata as { succeeded?: boolean } | null)?.succeeded ? "Resolved by the food lookup service" : "No food/provider result", createdAt: event.createdAt.toISOString() })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    user: { ...serializeUser(user), subscription: user.subscription ? { plan: user.subscription.plan, status: user.subscription.status, currentPeriodEnd: user.subscription.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd, lifetimePurchasedAt: user.subscription.lifetimePurchasedAt?.toISOString() ?? null } : null },
    overview: { totalSets: setAggregate._count._all, totalReps: setAggregate._sum.reps ?? 0, nutritionDays7: nutritionDays7.length, nutritionDays30: nutritionDays30.length, averageCalories7: number(nutritionLast7._avg.caloriesKcalSnapshot), averageProtein7: number(nutritionLast7._avg.proteinGramsSnapshot), aiScans: aiAggregate._sum.aiScanCount ?? 0, describeUses: aiAggregate._sum.describeCount ?? 0, barcodeLookups: barcodeCount, supplementsTracked: user._count.supplementPlans, savedMeals: user._count.nutritionSavedMeals, followers: user._count.followers, following: user._count.following, records: user._count.personalRecords },
    timeline: timeline.slice(0, 50),
    workouts: recentWorkouts.map((workout) => ({ id: workout.id, title: workout.title ?? "Workout", startedAt: workout.startedAt.toISOString(), completedAt: workout.completedAt?.toISOString() ?? null, visibility: workout.visibility, exerciseNames: workout.exercises.map((exercise) => exercise.exercise.name), sets: workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0), volume: workoutVolume(workout.exercises), records: workout.personalRecords.length })),
    nutrition: recentNutrition.map((entry) => ({ ...entry, gramsConsumed: number(entry.gramsConsumed), caloriesKcalSnapshot: number(entry.caloriesKcalSnapshot), proteinGramsSnapshot: number(entry.proteinGramsSnapshot), carbohydrateGramsSnapshot: number(entry.carbohydrateGramsSnapshot), fatGramsSnapshot: number(entry.fatGramsSnapshot), loggedFor: entry.loggedFor.toISOString(), createdAt: entry.createdAt.toISOString() })),
    aiUsage: aiDays.map((day) => ({ date: day.date.toISOString(), aiScanCount: day.aiScanCount, describeCount: day.describeCount, updatedAt: day.updatedAt.toISOString() })),
    supplements: { plans: supplements.map((plan) => ({ id: plan.id, name: plan.supplementDefinition?.name ?? plan.customName ?? "Supplement", isActive: plan.isActive, frequency: plan.frequency, preferredTime: plan.preferredTime, archivedAt: plan.archivedAt?.toISOString() ?? null })), logs: supplementLogs.map((log) => ({ id: log.id, name: log.supplementNameSnapshot, completedAt: log.completedAt.toISOString() })) },
    contributions: { foods: foods.map((food) => ({ ...food, confidenceScore: number(food.confidenceScore), createdAt: food.createdAt.toISOString(), reviewedAt: food.reviewedAt?.toISOString() ?? null })), parks: parks.map((park) => ({ ...park, createdAt: park.createdAt.toISOString(), reviewedAt: park.reviewedAt?.toISOString() ?? null })) },
    social: { follows: follows.map((follow) => ({ id: `${follow.followerId}-${follow.followingId}`, name: follow.following.name ?? follow.following.username ?? "Unknown user", createdAt: follow.createdAt.toISOString() })) },
    records: records.map((record) => ({ id: record.id, exercise: record.exercise.name, type: record.type, value: record.value, achievedAt: record.achievedAt.toISOString(), workout: { id: record.workout.id, title: record.workout.title ?? "Workout" } })),
  };
}
