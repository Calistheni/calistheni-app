"use client";

import {
  currentNutritionDate,
  requirePrimarySnapshot,
  usePrimarySnapshot,
} from "@native/lib/primary-data";
import { useNativeAuth } from "./NativeAuthProvider";

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NativeNutritionSurface({ active }: { active: boolean }) {
  const { state } = useNativeAuth();
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : "";
  const date = currentNutritionDate();
  const query = usePrimarySnapshot(userId, "nutrition", active, date);
  if (state.status !== "authenticated") return null;
  const data = requirePrimarySnapshot("nutrition", query.data);
  const calories = numeric(data.totals.caloriesKcal);
  const protein = numeric(data.totals.proteinGrams);
  const carbohydrate = numeric(data.totals.carbohydrateGrams);
  const fat = numeric(data.totals.fatGrams);

  return (
    <div className="native-primary-data-screen" data-native-component="NativeNutritionSurface">
      <header>
        <p className="native-eyebrow">Today</p>
        <h1>Nutrition</h1>
        <p>Your saved daily summary remains available while today’s log refreshes.</p>
      </header>
      <section className="native-primary-summary-grid" aria-label="Daily nutrition summary">
        {[
          ["Calories", calories === null ? null : Math.round(calories).toLocaleString()],
          ["Protein", protein === null ? null : `${Math.round(protein)} g`],
          ["Carbohydrate", carbohydrate === null ? null : `${Math.round(carbohydrate)} g`],
          ["Fat", fat === null ? null : `${Math.round(fat)} g`],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value ?? "Not recorded"}</strong>
          </article>
        ))}
      </section>
      <section className="native-primary-list-card">
        <h2>Today’s meals</h2>
        <p>{data.entryCount} logged {data.entryCount === 1 ? "item" : "items"}</p>
      </section>
      {query.isFetching ? <p className="native-refresh-note">Refreshing in the background…</p> : null}
      {query.isError ? <p className="native-refresh-note">Showing saved nutrition data while offline.</p> : null}
    </div>
  );
}
