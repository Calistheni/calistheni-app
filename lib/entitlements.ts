import "server-only";

import type {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveProEntitlementGrants,
  type ProEntitlementGrant,
} from "@/lib/entitlement-resolution";
import { isCanonicalUserIdAllowlisted } from "@/lib/sandbox-entitlement-allowlist";

export const FREE_ROUTINE_LIMIT = 4;
export const FREE_CUSTOM_EXERCISE_LIMIT = 7;

export type UserEntitlements = {
  isPro: boolean;
  routineLimit: number | null;
  customExerciseLimit: number | null;
  canEarnRewardPoints: boolean;
  hasFullProgressHistory: boolean;
};

export type UserProEntitlement = {
  isPro: boolean;
  grants: ProEntitlementGrant[];
};

/**
 * Nutrition capabilities intentionally remain separate even though both are
 * currently included with Pro. This keeps their product policy explicit and
 * lets it diverge later without introducing nutrition-specific subscription
 * state.
 */
export function canUseNutritionAiScan(
  entitlements: Pick<UserEntitlements, "isPro">
) {
  return entitlements.isPro;
}

export function canUseNutritionBarcodeScan(
  entitlements: Pick<UserEntitlements, "isPro">
) {
  return entitlements.isPro;
}

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

/**
 * Exact canonical user IDs only. Email addresses and client-provided flags are
 * deliberately unsupported so review access cannot be claimed or toggled by a
 * request. An empty/missing variable keeps every Sandbox purchase isolated.
 */
export function isSandboxEntitlementAllowlisted(
  userId: string,
  configured = process.env.APPLE_SANDBOX_ENTITLEMENT_USER_IDS
) {
  return isCanonicalUserIdAllowlisted(userId, configured);
}

export async function getUserEntitlements(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return {
      subscription: null,
      applePurchases: [],
      grants: [],
      entitlements: {
        isPro: false,
        routineLimit: FREE_ROUTINE_LIMIT,
        customExerciseLimit: FREE_CUSTOM_EXERCISE_LIMIT,
        canEarnRewardPoints: false,
        hasFullProgressHistory: false,
      } satisfies UserEntitlements,
    };
  }
  const allowSandboxAppleEntitlements =
    isSandboxEntitlementAllowlisted(userId);
  const [subscription, applePurchases] = await Promise.all([
    getUserSubscription(userId),
    prisma.applePurchase.findMany({
      where: {
        userId,
        environment: allowSandboxAppleEntitlements
          ? { in: ["PRODUCTION", "SANDBOX"] }
          : "PRODUCTION",
      },
      select: {
        environment: true,
        productId: true,
        productKind: true,
        state: true,
        expiresAt: true,
        gracePeriodExpiresAt: true,
        revokedAt: true,
      },
    }),
  ]);
  const proEntitlement = resolveProEntitlementGrants({
    subscription,
    applePurchases,
    allowSandboxAppleEntitlements,
  });
  const isPro = proEntitlement.isPro;

  return {
    subscription,
    applePurchases,
    grants: proEntitlement.grants,
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
