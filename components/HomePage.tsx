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
  inAppShell?: boolean;
};

export default function HomePage({ user, inAppShell = false }: HomePageProps) {
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [lightPreset, setLightPreset] = useState(getInitialLightPreset);
  const [theme, setTheme] = useState<MapTheme>("default");

  return (
    <main
      className={
        inAppShell
          ? "relative h-full min-h-0 w-full overflow-hidden"
          : "relative h-dvh w-full overflow-hidden"
      }
    >
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
        inAppShell={inAppShell}
      />
    </main>
  );
}
