"use client";

import { requirePrimarySnapshot, usePrimarySnapshot } from "@native/lib/primary-data";
import { useNativeAuth } from "./NativeAuthProvider";

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function DashboardValue({ value }: { value: string | number }) {
  return <strong data-known-value>{value}</strong>;
}

export function NativeHomeSurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = usePrimarySnapshot(userId, "home", active);
  if (state.status !== "authenticated") return null;
  const data = requirePrimarySnapshot("home", query.data);
  const metrics = [
    { label: "Workouts", value: data.week.workouts },
    { label: "Completed sets", value: data.week.completedSets },
    {
      label: "Volume",
      value: data.week.totalVolumeKg === null
        ? "Not applicable"
        : `${Math.round(data.week.totalVolumeKg).toLocaleString()} kg`,
    },
    { label: "Active days", value: data.week.activeDays },
  ];

  return (
    <div className="native-home-screen" data-home-snapshot="ready" data-native-component="NativeHomeSurface">
      <header>
        <p className="native-eyebrow">Your training</p>
        <h1>Welcome back, {data.greetingName}.</h1>
        <p>{data.streakDays > 0 ? `${data.streakDays}-day streak — keep it moving.` : "Keep your momentum going."}</p>
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
              <DashboardValue value={metric.value} />
            </article>
          ))}
        </div>
        <div className="native-home-details">
          <p><span>Total reps</span><strong>{data.week.totalReps.toLocaleString()}</strong></p>
          <p><span>Training time</span><strong>{formatDuration(data.week.durationSeconds)}</strong></p>
          <p><span>New records</span><strong>{data.week.personalRecords.toLocaleString()}</strong></p>
          <p><span>Weekly goal</span><strong>{data.week.workouts}/{data.week.workoutGoal}</strong></p>
        </div>
      </section>

      <section className="native-home-recent">
        <p className="native-eyebrow">Latest activity</p>
        <h2>Recent workout</h2>
        <p>{data.recentWorkout?.title ?? "No completed workout yet"}</p>
      </section>

      {query.isFetching ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
      {query.isError ? <p className="native-refresh-note">Showing saved data. Refresh will retry when the network returns.</p> : null}
    </div>
  );
}
