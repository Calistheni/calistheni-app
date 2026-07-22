"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Info,
  LoaderCircle,
  LogIn,
  LocateFixed,
  MapPin,
  MapPinPlus,
  MapPinned,
  UserPlus,
} from "lucide-react";
import ParksMap, {
  getInitialLightPreset,
  type MapTheme,
  type ParksLocationStatus,
  type ParksMapHandle,
} from "@/components/ParksMap";
import { GuestParksOnboarding } from "@/components/parks/GuestParksOnboarding";
import { UserMenu } from "@/components/UserMenu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParkSummary } from "@/types/park";

const LOCATION_ONBOARDING_KEY = "parks-location-onboarding-complete";
const GUEST_ONBOARDING_KEY = "calistheni-parks-guest-onboarding-seen";
const PARKS_SIGN_IN_HREF = "/login?callbackUrl=%2Fparks";
const PARKS_CREATE_ACCOUNT_HREF =
  "/login?callbackUrl=%2Fparks&intent=signup";

type GuestOnboardingState = "checking" | "open" | "closed";

type HomePageProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
  inAppShell?: boolean;
};

function RecenterButtonRegion({
  visible,
  isFindingLocation,
  isRecentering,
  label,
  onRecenter,
}: {
  visible: boolean;
  isFindingLocation: boolean;
  isRecentering: boolean;
  label: string;
  onRecenter: () => void;
}) {
  return (
    <div
      className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-out ${
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!visible || undefined}
      inert={!visible || undefined}
    >
      <div
        className={`min-h-0 overflow-hidden transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="border-t bg-background p-3 sm:px-6 sm:py-4">
          <div className="mx-auto max-w-7xl">
            <Button
              type="button"
              size="lg"
              className="w-full"
              aria-label={label}
              aria-busy={isFindingLocation || isRecentering}
              onClick={onRecenter}
              disabled={!visible || isFindingLocation || isRecentering}
            >
              {isFindingLocation ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <LocateFixed aria-hidden="true" />
              )}
              {label}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage({ user, inAppShell = false }: HomePageProps) {
  const mapRef = useRef<ParksMapHandle>(null);
  const [parks, setParks] = useState<ParkSummary[]>([]);
  const [lightPreset, setLightPreset] = useState(getInitialLightPreset);
  const [theme, setTheme] = useState<MapTheme>("default");
  const [locationStatus, setLocationStatus] =
    useState<ParksLocationStatus>("idle");
  const [isMapFocusedOnUser, setIsMapFocusedOnUser] = useState(false);
  const [isRecentering, setIsRecentering] = useState(false);
  const [showLocationHelper, setShowLocationHelper] = useState(false);
  const [guestOnboardingState, setGuestOnboardingState] =
    useState<GuestOnboardingState>(user ? "closed" : "checking");
  const [showGuestAddParkPrompt, setShowGuestAddParkPrompt] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShowLocationHelper(
        localStorage.getItem(LOCATION_ONBOARDING_KEY) !== "true"
      );

      if (localStorage.getItem("user-location")) {
        setLocationStatus("success");
      }

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
  const isGuestOnboardingOpen = !user && guestOnboardingState === "open";
  const areGuestControlsReady =
    Boolean(user) || guestOnboardingState !== "checking";
  const isGuestMapUnavailable =
    !user && guestOnboardingState !== "closed";
  const shouldShowRecenterButton =
    locationStatus === "success" && !isMapFocusedOnUser;

  return (
    <main
      className={
        inAppShell
          ? "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
          : "relative flex h-dvh w-full flex-col overflow-hidden bg-background"
      }
    >
      {showLocationHelper && !isGuestOnboardingOpen ? (
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
        <div
          className="h-full"
          aria-hidden={isGuestMapUnavailable || undefined}
          inert={isGuestMapUnavailable || undefined}
        >
          <ParksMap
            ref={mapRef}
            parks={parks}
            selectedPark={null}
            lightPreset={lightPreset}
            theme={theme}
            searchControlVariant={user ? "authenticated" : "guest"}
            showInitialLoadingDialog={Boolean(user)}
            onViewportParksChange={setParks}
            onLocationStatusChange={handleLocationStatusChange}
            onRecenterStateChange={setIsRecentering}
            onUserFocusChange={setIsMapFocusedOnUser}
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
            <div
              className={
                user
                  ? "absolute top-[calc(env(safe-area-inset-top)+1rem)] left-[4.25rem] z-40 sm:left-[5.75rem]"
                  : "absolute top-[calc(env(safe-area-inset-top)+1rem)] left-[7rem] z-40 sm:left-[8rem]"
              }
            >
              {user ? (
                <Button
                  asChild
                  className="h-10 gap-2 rounded-full px-3 shadow-md sm:px-4"
                >
                  <Link href="/my-parks">
                    <MapPinPlus className="size-4" aria-hidden="true" />
                    Add park
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-10 gap-2 rounded-full px-3 shadow-md sm:px-4"
                  onClick={() => setShowGuestAddParkPrompt(true)}
                >
                  <MapPinPlus className="size-4" aria-hidden="true" />
                  Add park
                </Button>
              )}
            </div>
          </>
        ) : null}

        {isGuestOnboardingOpen ? (
          <GuestParksOnboarding
            parkCount={parks.length || undefined}
            onExplore={dismissGuestOnboarding}
            createAccountHref={PARKS_CREATE_ACCOUNT_HREF}
            signInHref={PARKS_SIGN_IN_HREF}
          />
        ) : null}
      </div>

      {user ? (
        <>
          <RecenterButtonRegion
            visible={shouldShowRecenterButton}
            isFindingLocation={isFindingLocation}
            isRecentering={isRecentering}
            label={locationButtonLabel}
            onRecenter={useMyLocation}
          />
          {locationStatus === "denied" ||
          locationStatus === "unavailable" ? (
            <div
              className="shrink-0 border-t bg-background p-3 sm:px-6 sm:py-4"
              aria-live="polite"
            >
              <div className="mx-auto max-w-7xl">
                {locationStatus === "denied" ? (
                  <Alert className="border-destructive/30 bg-destructive/5">
                    <AlertTriangle
                      className="text-destructive"
                      aria-hidden="true"
                    />
                    <AlertTitle>Location permission was denied.</AlertTitle>
                    <AlertDescription>
                      <p>
                        Enable location access in your browser to find nearby
                        parks.
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
                  <Alert className="border-destructive/30 bg-destructive/5">
                    <AlertTriangle
                      className="text-destructive"
                      aria-hidden="true"
                    />
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
          ) : null}
        </>
      ) : guestOnboardingState === "closed" ? (
        <div className="shrink-0 bg-background">
          <RecenterButtonRegion
            visible={shouldShowRecenterButton}
            isFindingLocation={isFindingLocation}
            isRecentering={isRecentering}
            label={locationButtonLabel}
            onRecenter={useMyLocation}
          />
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
              Park submissions are connected to your account and reviewed
              before they appear on the map.
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
