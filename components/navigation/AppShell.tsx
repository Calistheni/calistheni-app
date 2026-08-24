"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  BadgeEuro,
  Gift,
  Home,
  MapPin,
  UserRound,
  UsersRound,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { ActiveWorkoutDock } from "@/components/workouts/ActiveWorkoutDock";
import { ActiveWorkoutProvider } from "@/components/workouts/ActiveWorkoutProvider";
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
  user: {
    name?: string | null;
    email?: string | null;
    unreadCommunityActivity?: number;
  } | null;
};

const navigationIcons: Record<PrimaryNavigationKey, LucideIcon> = {
  home: Home,
  nutrition: Utensils,
  parks: MapPin,
  community: UsersRound,
  rewards: Gift,
  pricing: BadgeEuro,
  profile: UserRound,
};

const routeWarmupTargets = {
  "/home": ["/workouts", "/nutrition", "/parks", "/feed"],
  "/workouts": ["/routines", "/home", "/profile"],
  "/routines": ["/workouts", "/home"],
  "/nutrition": ["/home", "/workouts", "/profile"],
  "/parks": ["/home", "/profile", "/my-parks"],
  "/feed": ["/home", "/profile"],
  "/profile": ["/home", "/workouts", "/nutrition"],
} as const;

function getRouteWarmupTargets(pathname: string) {
  const matchingRoute = Object.keys(routeWarmupTargets).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  ) as keyof typeof routeWarmupTargets | undefined;

  return matchingRoute ? routeWarmupTargets[matchingRoute] : [];
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSignedIn = Boolean(user);

  useEffect(() => {
    if (!isSignedIn || !usesSignedInAppShell(pathname)) return;

    // Let the current route paint first. This complements Link's viewport
    // prefetching on WKWebView without boot-prefetching every destination or
    // executing any route-local client feature (maps, scanners, charts, etc.).
    let idleId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const warmRoutes = () => {
        idleId = null;
        for (const href of getRouteWarmupTargets(pathname)) {
          router.prefetch(href);
        }
      };

      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(warmRoutes, { timeout: 1_200 });
      } else {
        fallbackTimer = setTimeout(warmRoutes, 300);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    };
  }, [isSignedIn, pathname, router]);

  if (!user || !usesSignedInAppShell(pathname)) return children;

  const activeKey = getActivePrimaryNavigation(pathname);
  const isFullBleed = isFullBleedAppRoute(pathname);
  const usesFocusedWorkoutMode = pathname === "/workouts/new";
  const locksViewport = isFullBleed || usesFocusedWorkoutMode;
  const keepsMobileHeader = pathname === "/pro";

  return (
    <ActiveWorkoutProvider>
      <div
        className={cn(
          "app-shell flex min-h-dvh flex-col bg-background",
          locksViewport && "h-dvh overflow-hidden"
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-40 h-14 shrink-0 border-b bg-background",
            !keepsMobileHeader && "hidden md:block"
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
                    onPointerDown={() => {
                      if (!active) router.prefetch(item.href);
                    }}
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
                    {item.key === "community" &&
                    user.unreadCommunityActivity ? (
                      <span
                        className="flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white"
                        aria-label={`${user.unreadCommunityActivity} unread community activities`}
                      >
                        {user.unreadCommunityActivity > 9
                          ? "9+"
                          : user.unreadCommunityActivity}
                      </span>
                    ) : null}
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
            usesFocusedWorkoutMode &&
              "app-shell-content-focused-workout app-scrollbar-hidden"
          )}
          {...(usesFocusedWorkoutMode
            ? {
                "data-active-workout-scroll-owner": true,
                "data-keyboard-dismiss-on-scroll": true,
              }
            : {})}
        >
          {children}
        </div>
        <ActiveWorkoutDock />

        {usesFocusedWorkoutMode ? null : (
          <nav
            aria-label="Primary navigation"
            className="app-mobile-nav border-t bg-background"
          >
            <div className="app-mobile-nav-grid flex w-full flex-nowrap items-stretch overflow-hidden">
              {mobilePrimaryNavigation.map((item) => {
                const Icon = navigationIcons[item.key];
                const active = activeKey === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onPointerDown={() => {
                      if (!active) router.prefetch(item.href);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 min-w-0 flex-1 basis-0 touch-manipulation flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                    {item.key === "community" &&
                    user.unreadCommunityActivity ? (
                      <span
                        className="absolute top-1 right-[calc(50%-14px)] size-2 rounded-full bg-red-500"
                        aria-label={`${user.unreadCommunityActivity} unread community activities`}
                      />
                    ) : null}
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </ActiveWorkoutProvider>
  );
}
