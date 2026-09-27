"use client";

import { assetUrl } from "@native/lib/api";
import { usePrimarySnapshot } from "@native/lib/primary-data";
import { useNativeAuth } from "./NativeAuthProvider";

export function NativeRewardsSurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = usePrimarySnapshot(userId, "rewards", active);
  if (state.status !== "authenticated" || !query.data) return null;
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
        <strong>{data.balance.toLocaleString()}</strong>
        <span>Calis Points</span>
        <em>{data.entitlement.isPro ? "Pro active" : "Free membership"}</em>
      </section>
      <section>
        <h2>Available rewards</h2>
        <div className="native-reward-grid">
          {data.rewards.length ? data.rewards.map((reward) => (
            <article key={reward.id}>
              {/* Public partner media is intentionally rendered directly; protected media is not supported here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {assetUrl(reward.imageUrl) ? <img src={assetUrl(reward.imageUrl)!} alt="" /> : <div className="native-reward-image" />}
              <small>{reward.partnerName}</small>
              <h3>{reward.title}</h3>
              <p>{reward.description}</p>
              <strong>{reward.pointsCost.toLocaleString()} points</strong>
            </article>
          )) : <article><h3>No rewards available</h3><p>New partner rewards will appear here when they become available.</p></article>}
        </div>
      </section>
      {query.isFetching ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
      {query.isError ? <p className="native-refresh-note">Showing saved rewards while offline.</p> : null}
    </div>
  );
}
