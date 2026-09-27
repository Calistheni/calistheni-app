"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPrimarySnapshot, primaryQueryKey } from "@native/lib/primary-data";
import type { NativeParks } from "@native/lib/types";
import { useNativeAuth } from "./NativeAuthProvider";

export function NativeParksSurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const query = useQuery<NativeParks>({
    queryKey: primaryQueryKey(userId, "parks"),
    enabled: active && Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => fetchPrimarySnapshot(userId, "parks", undefined, signal),
  });
  if (state.status !== "authenticated") return null;
  const data = query.data;

  return (
    <div className="native-primary-data-screen native-parks-screen">
      <header>
        <p className="native-eyebrow">Explore</p>
        <h1>Workout parks</h1>
        <p>Park controls and saved metadata are local. The map initializes only when this surface needs it.</p>
      </header>
      <section className="native-map-shell" aria-label="Parks map">
        <div className="native-map-controls"><button type="button">Search this area</button><button type="button">My location</button></div>
        <p>Map viewport ready</p>
      </section>
      <section className="native-primary-list-card">
        <h2>Available parks</h2>
        <p>{data ? `${data.publicParkCount.toLocaleString()} public parks in the current catalogue` : "Park catalogue metadata will appear after the first sync."}</p>
      </section>
      {query.isFetching && data ? <p className="native-refresh-note">Refreshing park metadata in the background…</p> : null}
      {query.isError && data ? <p className="native-refresh-note">Showing saved park metadata while offline.</p> : null}
    </div>
  );
}
