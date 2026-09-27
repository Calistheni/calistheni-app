export type NativeBootstrap = {
  user: { id: string; name: string | null; username: string | null; image: string | null };
  onboarding: { completed: boolean };
  communityUnreadCount: number;
  entitlement: { isPro: boolean; grants: Array<{ provider: "STRIPE" | "APPLE"; kind: string }> };
  serverTime: string;
};

export type NativeRewards = {
  balance: number;
  rewards: Array<{ id: number; title: string; partnerName: string; description: string; imageUrl: string | null; pointsCost: number }>;
  redemptions: Array<{ id: number; rewardId: number; status: string; createdAt: string }>;
  entitlement: { isPro: boolean; canEarnRewardPoints: boolean };
  updatedAt: string;
};
