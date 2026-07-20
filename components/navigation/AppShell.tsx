"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeEuro,
  Dumbbell,
  Gift,
  Home,
  MapPin,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { ActiveWorkoutDock } from "@/components/workouts/ActiveWorkoutDock";
import {
  getActivePrimaryNavigation,
  desktopPrimaryNavigation,
  isFullBleedAppRoute,
  mobilePrimaryNavigation,
  type PrimaryNavigationKey,
  usesSignedInAppShell,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./AccountMenu";

type AppShellProps = {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null } | null;
};

const navigationIcons: Record<PrimaryNavigationKey, LucideIcon> = {
  home: Home,
  train: Dumbbell,
  parks: MapPin,
  community: UsersRound,
  rewards: Gift,
  pricing: BadgeEuro,
  profile: UserRound,
};

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();

  if (!user || !usesSignedInAppShell(pathname)) return children;

  const activeKey = getActivePrimaryNavigation(pathname);
  const isFullBleed = isFullBleedAppRoute(pathname);
  const usesFocusedWorkoutMode = pathname === "/workouts/new";

  return (
    <div
      className={cn(
        "app-shell flex min-h-dvh flex-col bg-background",
        isFullBleed && "h-dvh overflow-hidden"
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-40 h-14 shrink-0 border-b bg-background",
          (usesFocusedWorkoutMode || isFullBleed) && "hidden md:block"
        )}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-3 sm:px-6">
            <Link
              href="/home"
              aria-label="Calistheni home"
              className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
            >
              <Image
                src="/icons/icon.png"
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-md"
                priority
              />
              <span className="hidden xl:inline">Calistheni</span>
            </Link>

            <nav
              aria-label="Primary navigation"
              className="app-desktop-nav min-w-0 flex-1 items-center justify-center gap-0.5 lg:gap-1"
            >
              {desktopPrimaryNavigation.map((item) => {
                const Icon = navigationIcons[item.key];
                const active = activeKey === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground xl:px-3",
                      active &&
                        "border border-primary/30 bg-primary/10 text-primary"
                    )}
                  >
                    <Icon
                      className="hidden size-4 xl:block"
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto hidden shrink-0 items-center md:flex md:ml-0">
              <AccountMenu user={user} />
            </div>
        </div>
      </header>

      <div
        className={cn(
          "app-shell-content min-h-0",
          isFullBleed && "app-shell-content-full-bleed",
          usesFocusedWorkoutMode && "app-shell-content-focused-workout"
        )}
      >
        {children}
      </div>
      <ActiveWorkoutDock />

      {usesFocusedWorkoutMode ? null : (
        <nav
          aria-label="Primary navigation"
          className="app-mobile-nav border-t bg-background"
        >
          <div className="app-mobile-nav-grid">
            {mobilePrimaryNavigation.map((item) => {
              const Icon = navigationIcons[item.key];
              const active = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium text-muted-foreground transition-colors",
                    active && "text-primary"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border border-transparent",
                      active && "border-primary/25 bg-primary/10"
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
