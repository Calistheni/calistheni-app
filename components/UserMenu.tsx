"use client";

import Link from "next/link";
import {
  CircleUserRound,
  Handshake,
  ListChecks,
  MapPinPlus,
  Settings2,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MapLightPreset, MapTheme } from "@/components/ParksMap";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  user: { name?: string | null; email?: string | null } | null;
  lightPreset: MapLightPreset;
  onLightPresetChange: (lightPreset: MapLightPreset) => void;
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
  inAppShell?: boolean;
};

export function UserMenu({
  user,
  lightPreset,
  onLightPresetChange,
  theme,
  onThemeChange,
  inAppShell = false,
}: UserMenuProps) {
  return (
    <div
      className={cn(
        "fixed left-4 z-50 sm:left-8",
        inAppShell ? "top-[4.5rem]" : "top-4"
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-10 rounded-full bg-card shadow-md"
            aria-label={inAppShell ? "Open map settings" : "Open menu"}
          >
            {inAppShell ? (
              <Settings2 className="size-5" />
            ) : (
              <CircleUserRound className="size-5" />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={8} className="w-56">
          {!user ? (
            <>
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/login">Login</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/partners">
                  <Handshake aria-hidden="true" />
                  Partners
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          {user ? (
            <>
              <DropdownMenuLabel>Park contributions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/submit-park">
                  <MapPinPlus aria-hidden="true" />
                  Submit a park
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/my-parks">
                  <ListChecks aria-hidden="true" />
                  My submissions
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
    </div>
  );
}
