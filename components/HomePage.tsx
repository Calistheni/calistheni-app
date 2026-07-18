"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPinPlus } from "lucide-react";
import ParksMap, {
  getInitialLightPreset,
  type MapTheme,
} from "@/components/ParksMap";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <div
        className={cn(
          "fixed left-[4.25rem] z-40 sm:left-[5.75rem]",
          inAppShell ? "top-[4.5rem]" : "top-4"
        )}
      >
        <Button asChild className="h-10 gap-2 rounded-full px-3 shadow-md sm:px-4">
          <Link href={user ? "/my-parks" : "/login"}>
            <MapPinPlus className="size-4" aria-hidden="true" />
            Add park
          </Link>
        </Button>
      </div>
    </main>
  );
}
