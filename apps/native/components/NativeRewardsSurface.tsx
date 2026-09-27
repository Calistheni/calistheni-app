"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, assetUrl } from "@native/lib/api";
import { writeUserCache } from "@native/lib/cache";
import type { NativeRewards } from "@native/lib/types";
import { useNativeAuth } from "./NativeAuthProvider";

export function NativeRewardsSurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = useQuery({
    queryKey: ["native", "rewards", userId],
    enabled: active && Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const value = await apiFetch<NativeRewards>("/api/native/v1/rewards");
      await writeUserCache(userId, "rewards", value);
      return value;
    },
  });
  if (state.status !== "authenticated") return null;
  const data = query.data;
  return (
    <div className="native-rewards-screen">
      <header>
        <p className="native-eyebrow">Calis Points</p>
        <h1>Train. Earn. <span>Unlock.</span></h1>
        <p>Your balance and partner rewards come from your Calistheni account.</p>
      </header>
      <section className="native-balance-card">
        <p>Current balance</p>
        <strong>{data ? data.balance.toLocaleString() : "—"}</strong>
        <span>Calis Points</span>
        <em>{data ? (data.entitlement.isPro ? "Pro active" : "Free membership") : "Checking membership…"}</em>
      </section>
      <section>
        <h2>Available rewards</h2>
        <div className="native-reward-grid">
          {data?.rewards.length ? data.rewards.map((reward) => (
            <article key={reward.id}>
              {/* Public partner media is intentionally rendered directly; protected media is not supported here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {assetUrl(reward.imageUrl) ? <img src={assetUrl(reward.imageUrl)!} alt="" /> : <div className="native-reward-image" />}
              <small>{reward.partnerName}</small>
              <h3>{reward.title}</h3>
              <p>{reward.description}</p>
              <strong>{reward.pointsCost.toLocaleString()} points</strong>
            </article>
          )) : [0, 1, 2].map((item) => <article key={item} className="native-reward-placeholder"><div className="native-reward-image" /><h3>Reward preview</h3><p>{query.isError ? "Unable to refresh. Cached rewards remain available when present." : "Reward details will appear here."}</p></article>)}
        </div>
      </section>
      {query.isFetching && data ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
    </div>
  );
}
