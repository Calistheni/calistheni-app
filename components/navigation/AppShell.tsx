"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  primaryTabNavigation,
  type PrimaryNavigationKey,
  usesSignedInAppShell,
} from "@/lib/navigation";
import {
  getPrimaryNavigationTapAction,
  scrollPrimaryRouteToTop,
} from "@/lib/navigation-scroll";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./AccountMenu";
import {
  AppShellUserProvider,
  PrimaryTabNavigationTargetProvider,
  type AppShellUser,
} from "./AppShellContext";

type AppShellProps = {
  children: React.ReactNode;
  user: AppShellUser | null;
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

const primaryTabHrefs = primaryTabNavigation.map(({ href }) => href);

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSignedIn = Boolean(user);
  const isAppShellRoute = usesSignedInAppShell(pathname);
  const prefetchedPrimaryTabs = useRef(false);
  const navigationStart = useRef<{ href: string; startedAt: number } | null>(
    null
  );
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !isAppShellRoute || prefetchedPrimaryTabs.current) {
      return;
    }

    // Let the current route paint first, then warm every primary tab's route
    // payload. Prefetching the route does not mount route-local features such
    // as Mapbox, scanners, or charts.
    let idleId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const warmRoutes = () => {
        idleId = null;
        prefetchedPrimaryTabs.current = true;
        for (const href of primaryTabHrefs) {
          if (href === pathname) continue;
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
  }, [isAppShellRoute, isSignedIn, pathname, router]);

  useEffect(() => {
    const pendingNavigation = navigationStart.current;
    if (process.env.NODE_ENV === "production" || !pendingNavigation) return;

    const frame = window.requestAnimationFrame(() => {
      const surface = document.querySelector<HTMLElement>(
        `[data-primary-tab-surface="${pendingNavigation.href}"]`
      );
      if (!surface || surface.offsetParent === null) return;

      navigationStart.current = null;
      const elapsed = performance.now() - pendingNavigation.startedAt;
      console.info(
        `[NavigationTiming] ${pendingNavigation.href} real shell visible in ${elapsed.toFixed(1)}ms`
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pendingHref]);

  useEffect(() => {
    if (!pendingHref) return;
    if (
      getActivePrimaryNavigation(pathname) ===
      getActivePrimaryNavigation(pendingHref)
    ) {
      const frame = window.requestAnimationFrame(() => setPendingHref(null));
      return () => window.cancelAnimationFrame(frame);
    }

    const timeout = window.setTimeout(() => setPendingHref(null), 8_000);
    return () => window.clearTimeout(timeout);
  }, [pathname, pendingHref]);

  if (!user || !isAppShellRoute) {
    return (
      <AppShellUserProvider value={user}>
        <PrimaryTabNavigationTargetProvider value={pendingHref}>
          {children}
        </PrimaryTabNavigationTargetProvider>
      </AppShellUserProvider>
    );
  }

  const activeKey = getActivePrimaryNavigation(pendingHref ?? pathname);
  const isFullBleed = isFullBleedAppRoute(pendingHref ?? pathname);
  const usesFocusedWorkoutMode = pathname === "/workouts/new";
  const locksViewport = isFullBleed || usesFocusedWorkoutMode;
  const handlePrimaryNavigationClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const action = getPrimaryNavigationTapAction(
      pathname,
      href,
      isFullBleedAppRoute(pathname)
    );
    if (action === "navigate") {
      setPendingHref(href);
      if (
        process.env.NODE_ENV !== "production" &&
        primaryTabHrefs.some((primaryHref) => primaryHref === href) &&
        navigationStart.current?.href !== href
      ) {
        navigationStart.current = { href, startedAt: event.timeStamp };
      }
      return;
    }

    event.preventDefault();
    if (action === "scroll") scrollPrimaryRouteToTop();
  };
  const handlePrimaryNavigationPointerDown = (
    event: React.PointerEvent<HTMLAnchorElement>,
    href: string,
    active: boolean
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      active
    ) {
      return;
    }

    setPendingHref(href);
    router.prefetch(href);
    if (
      process.env.NODE_ENV !== "production" &&
      primaryTabHrefs.some((primaryHref) => primaryHref === href)
    ) {
      navigationStart.current = { href, startedAt: event.timeStamp };
    }
  };

  return (
    <AppShellUserProvider value={user}>
      <PrimaryTabNavigationTargetProvider value={pendingHref}>
        <ActiveWorkoutProvider>
          <div
            className={cn(
              "app-shell flex min-h-dvh flex-col bg-background",
              locksViewport && "h-dvh overflow-hidden"
            )}
          >
        <header className="sticky top-0 z-40 hidden h-14 shrink-0 border-b bg-background md:block">
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
                    scroll={
                      !primaryTabHrefs.some((href) => href === item.href)
                    }
                    onClick={(event) =>
                      handlePrimaryNavigationClick(event, item.href)
                    }
                    onPointerDown={(event) =>
                      handlePrimaryNavigationPointerDown(
                        event,
                        item.href,
                        active
                      )
                    }
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-accent-foreground active:scale-[0.97] active:bg-accent xl:px-3",
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
                    scroll={
                      !primaryTabHrefs.some((href) => href === item.href)
                    }
                    onClick={(event) =>
                      handlePrimaryNavigationClick(event, item.href)
                    }
                    onPointerDown={(event) =>
                      handlePrimaryNavigationPointerDown(
                        event,
                        item.href,
                        active
                      )
                    }
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 min-w-0 flex-1 basis-0 touch-manipulation flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground transition-[color,transform] active:scale-[0.96] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      </PrimaryTabNavigationTargetProvider>
    </AppShellUserProvider>
  );
}
