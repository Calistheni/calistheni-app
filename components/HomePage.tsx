"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MapPinPlus,
} from "lucide-react";
import ParksMap, {
  getInitialLightPreset,
  type MapTheme,
  type ParksLocationStatus,
  type ParksMapHandle,
} from "@/components/ParksMap";
import { UserMenu } from "@/components/UserMenu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ParkSummary } from "@/types/park";

const LOCATION_ONBOARDING_KEY = "parks-location-onboarding-complete";

type HomePageProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
  inAppShell?: boolean;
};

export default function HomePage({ user, inAppShell = false }: HomePageProps) {
  const mapRef = useRef<ParksMapHandle>(null);
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [lightPreset, setLightPreset] = useState(getInitialLightPreset);
  const [theme, setTheme] = useState<MapTheme>("default");
  const [locationStatus, setLocationStatus] =
    useState<ParksLocationStatus>("idle");
  const [showLocationHelper, setShowLocationHelper] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShowLocationHelper(
        localStorage.getItem(LOCATION_ONBOARDING_KEY) !== "true"
      );

      if (localStorage.getItem("user-location")) {
        setLocationStatus("success");
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function handleLocationStatusChange(status: ParksLocationStatus) {
    setLocationStatus(status);

    if (status === "success") {
      localStorage.setItem(LOCATION_ONBOARDING_KEY, "true");
      setShowLocationHelper(false);
    }
  }

  function useMyLocation() {
    mapRef.current?.requestUserLocation();
  }

  const isFindingLocation = locationStatus === "loading";
  const locationButtonLabel = isFindingLocation
    ? "Finding your location..."
    : locationStatus === "success"
      ? "Recenter on my location"
      : "Use my location";

  return (
    <main
      className={
        inAppShell
          ? "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
          : "relative flex h-dvh w-full flex-col overflow-hidden bg-background"
      }
    >
      {showLocationHelper ? (
        <div className="shrink-0 border-b bg-background p-3 sm:px-6 sm:py-4">
          <Card className="mx-auto max-w-7xl border-primary/20 bg-primary/5 py-0">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold">Find parks near you</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Allow location access to instantly discover parks close to
                    you.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className="w-full shrink-0 sm:w-auto"
                onClick={useMyLocation}
                disabled={isFindingLocation}
              >
                {isFindingLocation ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed aria-hidden="true" />
                )}
                {locationButtonLabel}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ParksMap
          ref={mapRef}
          parks={parks}
          selectedPark={null}
          lightPreset={lightPreset}
          theme={theme}
          onViewportParksChange={setParks}
          onLocationStatusChange={handleLocationStatusChange}
        />
        <UserMenu
          user={user}
          lightPreset={lightPreset}
          onLightPresetChange={setLightPreset}
          theme={theme}
          onThemeChange={setTheme}
          inAppShell={inAppShell}
        />
        <div className="absolute top-4 left-[4.25rem] z-40 sm:left-[5.75rem]">
          <Button
            asChild
            className="h-10 gap-2 rounded-full px-3 shadow-md sm:px-4"
          >
            <Link href={user ? "/my-parks" : "/login"}>
              <MapPinPlus className="size-4" aria-hidden="true" />
              Add park
            </Link>
          </Button>
        </div>
      </div>

      <div
        className="shrink-0 space-y-3 border-t bg-background p-3 sm:px-6 sm:py-4"
        aria-live="polite"
      >
        <div className="mx-auto max-w-7xl">
          <Button
            type="button"
            size="lg"
            className="w-full"
            aria-label={locationButtonLabel}
            aria-busy={isFindingLocation}
            onClick={useMyLocation}
            disabled={isFindingLocation}
          >
            {isFindingLocation ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed aria-hidden="true" />
            )}
            {locationButtonLabel}
          </Button>

          {locationStatus === "denied" ? (
            <Alert className="mt-3 border-destructive/30 bg-destructive/5">
              <AlertTriangle className="text-destructive" aria-hidden="true" />
              <AlertTitle>Location permission was denied.</AlertTitle>
              <AlertDescription>
                <p>
                  Enable location access in your browser to find nearby parks.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useMyLocation}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {locationStatus === "unavailable" ? (
            <Alert className="mt-3 border-destructive/30 bg-destructive/5">
              <AlertTriangle className="text-destructive" aria-hidden="true" />
              <AlertTitle>Location unavailable</AlertTitle>
              <AlertDescription>
                <p>We couldn’t determine your location.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useMyLocation}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </main>
  );
}
