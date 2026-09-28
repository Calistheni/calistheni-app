import { prisma } from "@/lib/prisma";
import { getUserEntitlements } from "@/lib/entitlements";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import { nativeCorsJson, nativeCorsPreflight, rejectDisallowedNativeOrigin } from "@/lib/native-api-cors";
import { completePrimaryPresentation } from "@/lib/primary-presentation";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function GET(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  const [user, rewards, redemptions, entitlement] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { rewardPoints: true } }),
    prisma.reward.findMany({ where: { active: true }, orderBy: [{ pointsCost: "asc" }, { title: "asc" }], take: 12, select: { id: true, title: true, partnerName: true, description: true, imageUrl: true, pointsCost: true } }),
    prisma.rewardRedemption.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, rewardId: true, status: true, createdAt: true } }),
    getUserEntitlements(userId),
  ]);
  if (!user) return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  return nativeCorsJson(request, completePrimaryPresentation({
    balance: user.rewardPoints,
    rewards,
    redemptions: redemptions.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    entitlement: { isPro: entitlement.entitlements.isPro, canEarnRewardPoints: entitlement.entitlements.canEarnRewardPoints },
    updatedAt: new Date().toISOString(),
  }), { headers: { "Cache-Control": "private, no-store" } });
}
