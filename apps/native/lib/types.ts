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

export type NativeHome = {
  greetingName: string;
  asOf: string;
  streakDays: number;
  week: {
    startsAt: string;
    workouts: number;
    completedSets: number;
    totalVolumeKg: number | null;
    activeDays: number;
    totalReps: number;
    durationSeconds: number;
    personalRecords: number;
    workoutGoal: number;
  };
  recentWorkout: { id: number; title: string; completedAt: string | null } | null;
};

export type NativeNutrition = {
  date: string;
  totals: Record<string, number | null | undefined>;
  goal: Record<string, number | string> | null;
  entryCount: number;
  updatedAt: string;
};

export type NativeCommunity = {
  items: Array<{
    id: number;
    title: string;
    completedAt: string | null;
    exerciseCount: number;
    setCount: number;
    totalVolume: number | null;
    athlete: { id: string; name: string | null; image: string | null };
  }>;
  updatedAt: string;
};

export type NativeParks = {
  publicParkCount: number;
  version: string | null;
  updatedAt: string;
};

export type NativeProfile = {
  user: {
    id: string;
    name: string | null;
    username: string | null;
    image: string | null;
  };
  stats: {
    workouts: number;
    completedSets: number;
    submittedParks: number;
    approvedEdits: number;
    approvedPhotos: number;
    rewardPoints: number;
    followers: number;
    following: number;
  };
  body: {
    bodyweightKg: number | null;
    measurementSystem: "METRIC" | "IMPERIAL";
  };
  entitlement: { isPro: boolean };
  updatedAt: string;
};
