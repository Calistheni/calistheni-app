"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BadgeEuro,
  ChartNoAxesCombined,
  Dumbbell,
  Gift,
  Handshake,
  House,
  ListChecks,
  LogIn,
  Menu,
  Settings2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MapLightPreset, MapTheme } from "@/components/ParksMap";

type GuestProtectedDestination = {
  label: string;
  href: string;
  description: string;
};

const guestProtectedDestinations = [
  {
    icon: Dumbbell,
    label: "Track workouts",
    href: "/workouts",
    description: "Sign in to log workouts and keep your training history.",
  },
  {
    icon: ListChecks,
    label: "Routines",
    href: "/routines",
    description: "Sign in to build and reuse training routines.",
  },
  {
    icon: ChartNoAxesCombined,
    label: "Progress",
    href: "/profile/records",
    description: "Sign in to review consistency, volume, and personal records.",
  },
  {
    icon: UsersRound,
    label: "Community",
    href: "/feed",
    description: "Sign in to connect with athletes and view your community feed.",
  },
] as const;

function getLoginHref(destination: string, intent?: "signup") {
  const params = new URLSearchParams({ callbackUrl: destination });

  if (intent) {
    params.set("intent", intent);
  }

  return `/login?${params.toString()}`;
}

type UserMenuProps = {
  user: { name?: string | null; email?: string | null } | null;
  lightPreset: MapLightPreset;
  onLightPresetChange: (lightPreset: MapLightPreset) => void;
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
  onShowParksIntroduction?: () => void;
  inAppShell?: boolean;
};

export function UserMenu({
  user,
  lightPreset,
  onLightPresetChange,
  theme,
  onThemeChange,
  onShowParksIntroduction,
  inAppShell = false,
}: UserMenuProps) {
  const [guestDestination, setGuestDestination] =
    useState<GuestProtectedDestination | null>(null);

  return (
    <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-4 z-50 sm:left-8">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-10 rounded-full bg-card shadow-md"
            aria-label={inAppShell ? "Open map settings" : "Open map menu"}
          >
            {inAppShell ? (
              <Settings2 className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={8} className="w-56">
          {!user ? (
            <>
              <DropdownMenuLabel>Discover Calistheni</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onShowParksIntroduction}>
                <House aria-hidden="true" />
                About Calistheni
              </DropdownMenuItem>
              {guestProtectedDestinations.map(
                ({ icon: Icon, ...destination }) => (
                  <DropdownMenuItem
                    key={destination.href}
                    onSelect={() => setGuestDestination(destination)}
                  >
                    <Icon aria-hidden="true" />
                    {destination.label}
                  </DropdownMenuItem>
                )
              )}
              <DropdownMenuItem asChild>
                <Link href="/rewards">
                  <Gift aria-hidden="true" />
                  Rewards
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/partners">
                  <Handshake aria-hidden="true" />
                  Partners
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/pro">
                  <BadgeEuro aria-hidden="true" />
                  Pricing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/login?callbackUrl=%2Fparks">
                  <LogIn aria-hidden="true" />
                  Sign in
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/login?callbackUrl=%2Fparks&intent=signup">
                  <UserPlus aria-hidden="true" />
                  Get started free
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuLabel>Map Light</DropdownMenuLabel>
          {(["dawn", "day", "dusk", "night"] as const).map((preset) => (
            <DropdownMenuItem
              key={preset}
              onClick={() => onLightPresetChange(preset)}
            >
              {lightPreset === preset ? "✓ " : ""}
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Map Theme</DropdownMenuLabel>
          {(["default", "faded", "monochrome"] as const).map((mapTheme) => (
            <DropdownMenuItem
              key={mapTheme}
              onClick={() => onThemeChange(mapTheme)}
            >
              {theme === mapTheme ? "✓ " : ""}
              {mapTheme.charAt(0).toUpperCase() + mapTheme.slice(1)}
            </DropdownMenuItem>
          ))}

          {!inAppShell ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>App Theme</DropdownMenuLabel>
              <div className="px-2 py-1">
                <ThemeSwitcher />
              </div>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={Boolean(guestDestination)}
        onOpenChange={(open) => {
          if (!open) {
            setGuestDestination(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Sign in to {guestDestination?.label.toLowerCase() ?? "continue"}
            </DialogTitle>
            <DialogDescription>
              {guestDestination?.description ??
                "Sign in to continue with Calistheni."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setGuestDestination(null)}
            >
              Not now
            </Button>
            {guestDestination ? (
              <>
                <Button asChild variant="outline">
                  <Link href={getLoginHref(guestDestination.href)}>
                    <LogIn aria-hidden="true" />
                    Sign in
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={getLoginHref(guestDestination.href, "signup")}>
                    <UserPlus aria-hidden="true" />
                    Get started free
                  </Link>
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
