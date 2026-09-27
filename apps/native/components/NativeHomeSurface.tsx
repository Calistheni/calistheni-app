"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchPrimarySnapshot,
  primaryQueryKey,
} from "@native/lib/primary-data";
import type { NativeHome } from "@native/lib/types";
import { useNativeAuth } from "./NativeAuthProvider";

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function DashboardValue({ value, unknown }: { value: string | number | null; unknown: boolean }) {
  return (
    <strong data-known-value={!unknown || undefined}>
      {unknown ? <span className="native-local-unknown">Loading locally saved data…</span> : value}
    </strong>
  );
}

export function NativeHomeSurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = useQuery<NativeHome>({
    queryKey: primaryQueryKey(userId, "home"),
    enabled: active && Boolean(userId),
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchPrimarySnapshot(userId, "home", undefined, signal),
  });
  if (state.status !== "authenticated") return null;
  const data = query.data;
  const unknown = data === undefined;
  const metrics = [
    { label: "Workouts", value: data?.week.workouts ?? null },
    { label: "Completed sets", value: data?.week.completedSets ?? null },
    {
      label: "Volume",
      value: data
        ? data.week.totalVolumeKg === null
          ? "Unavailable"
          : `${Math.round(data.week.totalVolumeKg).toLocaleString()} kg`
        : null,
    },
    { label: "Active days", value: data?.week.activeDays ?? null },
  ];

  return (
    <div className="native-home-screen" data-home-snapshot={data ? "ready" : "first-load"}>
      <header>
        <p className="native-eyebrow">Your training</p>
        <h1>Welcome back, {data?.greetingName ?? state.bootstrap.user.name?.split(/\s+/)[0] ?? "athlete"}.</h1>
        <p>{data ? data.streakDays > 0 ? `${data.streakDays}-day streak — keep it moving.` : "Keep your momentum going." : "Loading your saved dashboard for this first visit…"}</p>
      </header>

      <section className="native-home-actions" aria-label="Workout actions">
        <button type="button">Start Workout</button>
        <button type="button">Choose Routine</button>
      </section>

      <section className="native-weekly-report" aria-labelledby="native-week-heading">
        <div>
          <p className="native-eyebrow">Your momentum</p>
          <h2 id="native-week-heading">Weekly report</h2>
          <p>Monday through now. Last-known results stay visible while Calistheni refreshes.</p>
        </div>
        <div className="native-home-metrics">
          {metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <DashboardValue value={metric.value} unknown={unknown} />
            </article>
          ))}
        </div>
        <div className="native-home-details">
          <p><span>Total reps</span><strong>{data ? data.week.totalReps.toLocaleString() : "Pending first sync"}</strong></p>
          <p><span>Training time</span><strong>{data ? formatDuration(data.week.durationSeconds) : "Pending first sync"}</strong></p>
          <p><span>New records</span><strong>{data ? data.week.personalRecords.toLocaleString() : "Pending first sync"}</strong></p>
          <p><span>Weekly goal</span><strong>{data ? `${data.week.workouts}/${data.week.workoutGoal}` : "Pending first sync"}</strong></p>
        </div>
      </section>

      <section className="native-home-recent">
        <p className="native-eyebrow">Latest activity</p>
        <h2>Recent workout</h2>
        <p>{data ? data.recentWorkout?.title ?? "No completed workout yet" : "Your latest workout will appear after the first sync."}</p>
      </section>

      {query.isFetching && data ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
      {query.isError && data ? <p className="native-refresh-note">Showing saved data. Refresh will retry when the network returns.</p> : null}
    </div>
  );
}
