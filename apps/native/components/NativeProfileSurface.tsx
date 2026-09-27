"use client";

import { assetUrl } from "@native/lib/api";
import { requirePrimarySnapshot, usePrimarySnapshot } from "@native/lib/primary-data";
import { useNativeAuth } from "./NativeAuthProvider";

export function NativeProfileSurface({ active }: { active: boolean }) {
  const { state, logout } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = usePrimarySnapshot(userId, "profile", active);
  if (state.status !== "authenticated") return null;
  const data = requirePrimarySnapshot("profile", query.data);
  const bodyweight = data.body.bodyweightKg === null
    ? "Not recorded"
    : data.body.measurementSystem === "IMPERIAL"
      ? `${Math.round(data.body.bodyweightKg * 2.2046226218 * 10) / 10} lb`
      : `${Math.round(data.body.bodyweightKg * 10) / 10} kg`;
  const stats = [
    ["Workouts", data.stats.workouts],
    ["Completed sets", data.stats.completedSets],
    ["Parks", data.stats.submittedParks],
    ["Reward points", data.stats.rewardPoints],
  ] as const;

  return (
    <div className="native-profile-screen">
      <header className="native-profile-header">
        {assetUrl(data.user.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(data.user.image)!} alt="" />
        ) : <div className="native-profile-avatar" aria-hidden="true">{(data.user.name ?? "U").slice(0, 1)}</div>}
        <div>
          <p className="native-eyebrow">Your account</p>
          <h1>{data.user.name ?? "Profile"}</h1>
          <p>{data.user.username ? `@${data.user.username}` : "Calistheni athlete"}</p>
          <strong>{data.entitlement.isPro ? "Pro active" : "Free membership"}</strong>
        </div>
      </header>
      <section className="native-primary-summary-grid" aria-label="Profile statistics">
        {stats.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></article>)}
      </section>
      <section className="native-primary-list-card">
        <h2>Body and community</h2>
        <p>{bodyweight} · {data.stats.followers.toLocaleString()} followers · {data.stats.following.toLocaleString()} following</p>
        <p>{data.stats.approvedEdits.toLocaleString()} approved park edits · {data.stats.approvedPhotos.toLocaleString()} approved photos</p>
      </section>
      <button className="native-profile-logout" type="button" onClick={() => void logout()}>Sign out</button>
      {query.isFetching ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
      {query.isError ? <p className="native-refresh-note">Showing your saved profile while offline.</p> : null}
    </div>
  );
}
