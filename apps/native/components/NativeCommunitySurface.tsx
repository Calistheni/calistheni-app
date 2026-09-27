"use client";

import { requirePrimarySnapshot, usePrimarySnapshot } from "@native/lib/primary-data";
import { useNativeAuth } from "./NativeAuthProvider";

export function NativeCommunitySurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = usePrimarySnapshot(userId, "community", active);
  if (state.status !== "authenticated") return null;
  const data = requirePrimarySnapshot("community", query.data);

  return (
    <div className="native-primary-data-screen">
      <header>
        <p className="native-eyebrow">Community</p>
        <h1>Workout feed</h1>
        <p>The last successful feed stays intact while newer activity is checked.</p>
      </header>
      <section className="native-community-list" aria-label="Community workouts">
        {data.items.length ? data.items.map((item) => (
          <article key={item.id}>
            <small>{item.athlete.name ?? "Calistheni athlete"}</small>
            <h2>{item.title}</h2>
            <p>{item.exerciseCount} exercises · {item.setCount} sets{item.totalVolume === null ? "" : ` · ${Math.round(item.totalVolume).toLocaleString()} kg`}</p>
          </article>
        )) : <article><h2>Your feed is quiet</h2><p>Follow athletes to see their completed public workouts here.</p></article>}
      </section>
      {query.isFetching ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
      {query.isError ? <p className="native-refresh-note">Showing the saved feed while offline.</p> : null}
    </div>
  );
}
