import "server-only";

import type {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const FREE_ROUTINE_LIMIT = 4;
export const FREE_CUSTOM_EXERCISE_LIMIT = 7;

export type UserEntitlements = {
  isPro: boolean;
  routineLimit: number | null;
  customExerciseLimit: number | null;
  canEarnRewardPoints: boolean;
  hasFullProgressHistory: boolean;
};

export function hasProAccess(
  subscription:
    | Pick<Subscription, "plan" | "status" | "lifetimePurchasedAt">
    | null
    | undefined
) {
  if (subscription?.lifetimePurchasedAt) return true;

  return hasRecurringProAccess(subscription);
}

export function hasRecurringProAccess(
  subscription:
    | Pick<Subscription, "plan" | "status">
    | null
    | undefined
) {
  return (
    (subscription?.plan === "PRO_MONTHLY" ||
      subscription?.plan === "PRO_YEARLY") &&
    (subscription?.status === "ACTIVE" || subscription?.status === "TRIALING")
  );
}

export function hasOngoingRecurringSubscription(
  subscription:
    | Pick<Subscription, "plan" | "status" | "stripeSubscriptionId">
    | null
    | undefined
) {
  const isRecurringPlan =
    subscription?.plan === "PRO_MONTHLY" ||
    subscription?.plan === "PRO_YEARLY";

  return Boolean(
    isRecurringPlan &&
      subscription?.stripeSubscriptionId &&
      subscription.status !== "CANCELED" &&
      subscription.status !== "INACTIVE" &&
      subscription.status !== "INCOMPLETE_EXPIRED"
  );
}

export async function getUserSubscription(userId: string) {
  return prisma.subscription.findUnique({ where: { userId } });
}

export async function getUserEntitlements(userId: string) {
  const subscription = await getUserSubscription(userId);
  const isPro = hasProAccess(subscription);

  return {
    subscription,
    entitlements: {
      isPro,
      routineLimit: isPro ? null : FREE_ROUTINE_LIMIT,
      customExerciseLimit: isPro ? null : FREE_CUSTOM_EXERCISE_LIMIT,
      canEarnRewardPoints: isPro,
      hasFullProgressHistory: isPro,
    } satisfies UserEntitlements,
  };
}

export function canCreateRoutine(
  entitlements: UserEntitlements,
  currentRoutineCount: number
) {
  return (
    entitlements.routineLimit === null ||
    currentRoutineCount < entitlements.routineLimit
  );
}

export function canCreateCustomExercise(
  entitlements: UserEntitlements,
  currentCustomExerciseCount: number
) {
  return (
    entitlements.customExerciseLimit === null ||
    currentCustomExerciseCount < entitlements.customExerciseLimit
  );
}

export function canEarnRewardPoints(entitlements: UserEntitlements) {
  return entitlements.canEarnRewardPoints;
}

export function getFriendlySubscriptionPlan(plan: SubscriptionPlan) {
  if (plan === "PRO_MONTHLY") return "Pro Monthly";
  if (plan === "PRO_YEARLY") return "Pro Yearly";
  if (plan === "PRO_LIFETIME") return "Lifetime Pro";
  return "Free";
}

export function getFriendlySubscriptionStatus(status: SubscriptionStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
