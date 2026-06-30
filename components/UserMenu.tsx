"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { CircleUserRound } from "lucide-react";
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

type UserMenuProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
  lightPreset: MapLightPreset;
  onLightPresetChange: (lightPreset: MapLightPreset) => void;
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
};

export function UserMenu({
  user,
  lightPreset,
  onLightPresetChange,
  theme,
  onThemeChange,
}: UserMenuProps) {
  return (
    <div className="fixed top-4 left-4 z-50 sm:left-8">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-lg"
            className="h-10 w-10 rounded-full bg-card shadow-xl"
            aria-label="Open account menu"
          >
            <CircleUserRound className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={8} className="w-56">
          {user ? (
            <>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>Account</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {user.email ?? user.name}
                  </span>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuItem asChild>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href="/my-parks">My Parks</Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href="/submit-park">Submit Park</Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => void signOut({ callbackUrl: "/" })}
              >
                Logout
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuLabel>Account</DropdownMenuLabel>

              <DropdownMenuItem asChild>
                <Link href="/login">Login</Link>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuLabel>Map Light</DropdownMenuLabel>

          <DropdownMenuItem onClick={() => onLightPresetChange("dawn")}>
            {lightPreset === "dawn" ? "✓ " : ""}
            Dawn
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onLightPresetChange("day")}>
            {lightPreset === "day" ? "✓ " : ""}
            Day
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onLightPresetChange("dusk")}>
            {lightPreset === "dusk" ? "✓ " : ""}
            Dusk
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onLightPresetChange("night")}>
            {lightPreset === "night" ? "✓ " : ""}
            Night
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel>Map Theme</DropdownMenuLabel>

          <DropdownMenuItem onClick={() => onThemeChange("default")}>
            {theme === "default" ? "✓ " : ""}
            Default
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onThemeChange("faded")}>
            {theme === "faded" ? "✓ " : ""}
            Faded
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onThemeChange("monochrome")}>
            {theme === "monochrome" ? "✓ " : ""}
            Monochrome
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel>App Theme</DropdownMenuLabel>

          <div className="flex justify-left py-1">
            <ThemeSwitcher />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
