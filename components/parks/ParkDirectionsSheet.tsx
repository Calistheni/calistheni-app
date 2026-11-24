"use client";

import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ParkSummary } from "@/types/park";

type Destination = Pick<ParkSummary, "name" | "lat" | "lon">;
type Provider = "apple" | "google";
type AvailableApps = Record<Provider, boolean>;

const ParkDirections = registerPlugin<{
  availableApps(): Promise<AvailableApps>;
  openDirections(options: Destination & { provider: Provider }): Promise<{ opened: boolean }>;
}>("CalistheniParkDirections");

const providers = [
  { id: "apple", name: "Apple Maps" },
  { id: "google", name: "Google Maps" },
] as const;

export function hasParkDirectionsCoordinates({ lat, lon }: Destination) {
  return (
    Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    Number.isFinite(lon) && Math.abs(lon) <= 180
  );
}

export function ParkDirectionsSheet({
  park,
  trigger,
  onClose,
}: {
  park: Destination;
  trigger: HTMLButtonElement;
  onClose: () => void;
}) {
  const isIOS = Capacitor.getPlatform() === "ios";
  const [availableApps, setAvailableApps] = useState<AvailableApps | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [nativeLaunchFailed, setNativeLaunchFailed] = useState(false);
  const [browserLaunchFailed, setBrowserLaunchFailed] = useState(false);
  const showBrowserFallback = nativeLaunchFailed ||
    (availableApps !== null && !availableApps.apple && !availableApps.google);
  const destination = `${park.lat},${park.lon}`;
  const appleUrl = `https://maps.apple.com/directions?${new URLSearchParams({ destination })}`;
  const googleUrl = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination })}`;

  useEffect(() => {
    if (!isIOS) return;

    let active = true;
    async function loadAvailableApps() {
      let apps = { apple: false, google: false };
      if (Capacitor.isPluginAvailable("CalistheniParkDirections")) {
        try {
          apps = await ParkDirections.availableApps();
        } catch {
          // The browser remains available if native availability cannot be checked.
        }
      }
      if (active) setAvailableApps(apps);
    }

    void loadAvailableApps();
    return () => { active = false; };
  }, [isIOS]);

  async function openNative(provider: Provider) {
    setIsOpening(true);
    try {
      const result = await ParkDirections.openDirections({
        provider,
        name: park.name,
        lat: park.lat,
        lon: park.lon,
      });
      if (result.opened) {
        onClose();
        return;
      }
    } catch {
      // Leave the chooser open with directions to the same destination.
    } finally {
      setIsOpening(false);
    }
    setNativeLaunchFailed(true);
  }

  async function openBrowser() {
    setIsOpening(true);
    setBrowserLaunchFailed(false);
    try {
      await Browser.open({ url: googleUrl, presentationStyle: "fullscreen" });
      onClose();
    } catch {
      setBrowserLaunchFailed(true);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:mx-auto sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.isConnected) trigger.focus({ preventScroll: true });
        }}
      >
        <SheetHeader>
          <SheetTitle>Get directions</SheetTitle>
          <SheetDescription>{park.name}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4">
          {isIOS ? (
            <>
              {availableApps === null ? <p role="status">Checking maps apps…</p> : null}
              {providers.map(({ id, name }) => availableApps?.[id] ? (
                <Button key={id} type="button" variant="outline" disabled={isOpening} onClick={() => void openNative(id)}>
                  {name}
                </Button>
              ) : null)}
              {nativeLaunchFailed ? <p role="status">Couldn’t open the maps app.</p> : null}
              {showBrowserFallback ? (
                <Button type="button" variant="outline" disabled={isOpening} onClick={() => void openBrowser()}>
                  Open in browser
                </Button>
              ) : null}
              {browserLaunchFailed ? <p role="alert">Couldn’t open the browser. Try again.</p> : null}
            </>
          ) : providers.map(({ id, name }) => (
            <Button key={id} asChild variant="outline">
              <a href={id === "apple" ? appleUrl : googleUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}>
                {name}
              </a>
            </Button>
          ))}
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
