"use client";

import { Activity, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePrimaryTabNavigationTarget } from "@/components/navigation/AppShellContext";
import { getPrimaryTabHref, primaryTabNavigation } from "@/lib/navigation";

type PrimaryTabHostProps = {
  children: React.ReactNode;
  home: React.ReactNode;
  nutrition: React.ReactNode;
  parks: React.ReactNode;
  community: React.ReactNode;
  rewards: React.ReactNode;
};

/**
 * Persistent presentation owner for the five primary application screens.
 *
 * Next.js still owns the URL and supplies each parallel route. Activity keeps
 * visited screens and their client state available while pausing hidden
 * effects. The latest navigation intent only selects which retained surface is
 * visible; destination data never controls screen visibility.
 */
export function PrimaryTabHost({
  children,
  home,
  nutrition,
  parks,
  community,
  rewards,
}: PrimaryTabHostProps) {
  const pathname = usePathname();
  const navigationTarget = usePrimaryTabNavigationTarget();
  const committedHref = getPrimaryTabHref(pathname);
  const optimisticHref = getPrimaryTabHref(navigationTarget ?? "");
  const activeHref = optimisticHref ?? committedHref;
  const surfaces = { home, nutrition, parks, community, rewards };
  const previousHref = useRef(activeHref);
  const scrollPositions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const previous = previousHref.current;
    if (!activeHref || previous === activeHref) return;

    if (previous) scrollPositions.current.set(previous, window.scrollY);
    previousHref.current = activeHref;
    window.scrollTo({
      top: scrollPositions.current.get(activeHref) ?? 0,
      left: 0,
      behavior: "instant",
    });
  }, [activeHref]);

  return (
    <div
      data-primary-tab-host
      className={activeHref === "/parks" ? "h-full min-h-0" : undefined}
    >
      {primaryTabNavigation.map(({ key, href }) => (
        <Activity key={key} mode={activeHref === href ? "visible" : "hidden"}>
          <div
            data-primary-tab-surface={href}
            className={key === "parks" ? "h-full min-h-0" : undefined}
          >
            {surfaces[key]}
          </div>
        </Activity>
      ))}
      {children}
    </div>
  );
}
