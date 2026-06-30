"use client";

import { useState } from "react";
import ParksMap, {
  getInitialLightPreset,
  type MapTheme,
} from "@/components/ParksMap";
import { UserMenu } from "@/components/UserMenu";
import type { ParkSummary } from "@/types/park";

type HomePageProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
};

export default function HomePage({ user }: HomePageProps) {
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [lightPreset, setLightPreset] = useState(getInitialLightPreset);
  const [theme, setTheme] = useState<MapTheme>("default");

  return (
    <main className="h-screen overflow-hidden">
      <ParksMap
        parks={parks}
        selectedPark={null}
        lightPreset={lightPreset}
        theme={theme}
        onViewportParksChange={setParks}
      />
      <UserMenu
        user={user}
        lightPreset={lightPreset}
        onLightPresetChange={setLightPreset}
        theme={theme}
        onThemeChange={setTheme}
      />
    </main>
  );
}
