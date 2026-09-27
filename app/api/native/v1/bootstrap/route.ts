import { prisma } from "@/lib/prisma";
import { getUserEntitlements } from "@/lib/entitlements";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import { nativeCorsJson, nativeCorsPreflight, rejectDisallowedNativeOrigin } from "@/lib/native-api-cors";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function GET(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  const [user, communityUnreadCount, entitlement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, image: true, onboardingCompleted: true },
    }),
    prisma.workoutNotification.count({ where: { userId, readAt: null } }),
    getUserEntitlements(userId),
  ]);
  if (!user) return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  return nativeCorsJson(request, {
    user: { id: user.id, name: user.name, username: user.username, image: user.image },
    onboarding: { completed: user.onboardingCompleted },
    communityUnreadCount,
    entitlement: { isPro: entitlement.entitlements.isPro, grants: entitlement.grants.map((grant) => ({ provider: grant.provider, kind: grant.kind })) },
    serverTime: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
