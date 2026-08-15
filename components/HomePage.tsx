"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Info, LogIn, MapPinPlus, MapPinned, UserPlus } from "lucide-react";
import type { MapTheme } from "@/components/ParksMap";
import { getInitialLightPreset } from "@/lib/map-light-preset";
import { GuestParksOnboarding } from "@/components/parks/GuestParksOnboarding";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParkSummary } from "@/types/park";

// Mapbox is the heaviest client feature on Home; defer it until this map view
// is actually mounted instead of placing it on the shell's initial JS path.
const ParksMap = dynamic(() => import("@/components/ParksMap"), {
  ssr: false,
  loading: () => <div className="h-full bg-muted/30" aria-busy="true" />,
});

const GUEST_ONBOARDING_KEY = "calistheni-parks-guest-onboarding-seen";
const PARKS_SIGN_IN_HREF = "/login?callbackUrl=%2Fparks";
const PARKS_CREATE_ACCOUNT_HREF = "/login?callbackUrl=%2Fparks&intent=signup";

type GuestOnboardingState = "checking" | "open" | "closed";

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
  const [guestOnboardingState, setGuestOnboardingState] =
    useState<GuestOnboardingState>(user ? "closed" : "checking");
  const [showGuestAddParkPrompt, setShowGuestAddParkPrompt] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!user) {
        setGuestOnboardingState(
          localStorage.getItem(GUEST_ONBOARDING_KEY) === "true"
            ? "closed"
            : "open"
        );
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [user]);

  function dismissGuestOnboarding() {
    localStorage.setItem(GUEST_ONBOARDING_KEY, "true");
    setGuestOnboardingState("closed");
  }

  function reopenGuestOnboarding() {
    setGuestOnboardingState("open");
  }

  const isGuestOnboardingOpen = !user && guestOnboardingState === "open";
  const areGuestControlsReady =
    Boolean(user) || guestOnboardingState !== "checking";
  const isGuestMapUnavailable = !user && guestOnboardingState !== "closed";

  return (
    <main
      className={
        inAppShell
          ? "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
          : "relative flex h-dvh w-full flex-col overflow-hidden bg-background"
      }
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="h-full"
          aria-hidden={isGuestMapUnavailable || undefined}
          inert={isGuestMapUnavailable || undefined}
        >
          <ParksMap
            parks={parks}
            selectedPark={null}
            lightPreset={lightPreset}
            theme={theme}
            onViewportParksChange={setParks}
            addParkControl={
              user ? (
                <Button
                  asChild
                  className="pointer-events-auto h-10 gap-2 rounded-full px-3 shadow-md sm:px-4"
                >
                  <Link href="/my-parks">
                    <MapPinPlus className="size-4" aria-hidden="true" />
                    Add park
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="pointer-events-auto h-10 gap-2 rounded-full px-3 shadow-md sm:px-4"
                  onClick={() => setShowGuestAddParkPrompt(true)}
                >
                  <MapPinPlus className="size-4" aria-hidden="true" />
                  Add park
                </Button>
              )
            }
          />
        </div>
        {areGuestControlsReady ? (
          <>
            <UserMenu
              user={user}
              lightPreset={lightPreset}
              onLightPresetChange={setLightPreset}
              theme={theme}
              onThemeChange={setTheme}
              onShowParksIntroduction={reopenGuestOnboarding}
              inAppShell={inAppShell}
            />
          </>
        ) : null}

        {isGuestOnboardingOpen ? (
          <GuestParksOnboarding
            onExplore={dismissGuestOnboarding}
            createAccountHref={PARKS_CREATE_ACCOUNT_HREF}
            signInHref={PARKS_SIGN_IN_HREF}
          />
        ) : null}
      </div>

      {!user && guestOnboardingState === "closed" ? (
        <div className="shrink-0 bg-background">
          <nav
            aria-label="Guest navigation"
            className="grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 border-t pb-[env(safe-area-inset-bottom)]"
          >
            <div
              className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-primary"
              aria-current="page"
            >
              <MapPinned className="size-5" aria-hidden="true" />
              Explore
            </div>
            <button
              type="button"
              className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={reopenGuestOnboarding}
            >
              <Info className="size-5" aria-hidden="true" />
              About
            </button>
            <Link
              href={PARKS_SIGN_IN_HREF}
              className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <LogIn className="size-5" aria-hidden="true" />
              Sign in
            </Link>
          </nav>
        </div>
      ) : null}

      <Dialog
        open={showGuestAddParkPrompt}
        onOpenChange={setShowGuestAddParkPrompt}
      >
        <DialogContent className="bottom-0 top-auto max-w-none translate-y-0 rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:max-w-sm sm:-translate-y-1/2 sm:rounded-xl sm:pb-4">
          <DialogHeader>
            <DialogTitle>Sign in to add a park</DialogTitle>
            <DialogDescription>
              Park submissions are connected to your account and reviewed before
              they appear on the map.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:grid sm:grid-cols-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowGuestAddParkPrompt(false)}
            >
              Not now
            </Button>
            <Button asChild variant="outline">
              <Link href={PARKS_SIGN_IN_HREF}>
                <LogIn aria-hidden="true" />
                Sign in
              </Link>
            </Button>
            <Button asChild className="sm:col-span-2">
              <Link href={PARKS_CREATE_ACCOUNT_HREF}>
                <UserPlus aria-hidden="true" />
                Create account
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
