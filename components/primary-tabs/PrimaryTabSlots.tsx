"use client";

import { Activity, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePrimaryTabNavigationTarget } from "@/components/navigation/AppShellContext";
import { getPrimaryTabHref, primaryTabNavigation } from "@/lib/navigation";

type PrimaryTabSlotsProps = {
  children: React.ReactNode;
  home: React.ReactNode;
  nutrition: React.ReactNode;
  parks: React.ReactNode;
  community: React.ReactNode;
  rewards: React.ReactNode;
};

export function PrimaryTabSlots({
  children,
  home,
  nutrition,
  parks,
  community,
  rewards,
}: PrimaryTabSlotsProps) {
  const pathname = usePathname();
  const navigationTarget = usePrimaryTabNavigationTarget();
  const committedHref = getPrimaryTabHref(pathname);
  const optimisticHref = getPrimaryTabHref(navigationTarget ?? "");
  const activeHref = optimisticHref ?? committedHref;
  const slots = { home, nutrition, parks, community, rewards };
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
    <>
      {primaryTabNavigation.map(({ key, href }) => (
        <Activity key={key} mode={activeHref === href ? "visible" : "hidden"}>
          <div
            data-primary-tab-surface={href}
            className={key === "parks" ? "h-full min-h-0" : undefined}
          >
            {slots[key]}
          </div>
        </Activity>
      ))}
      {children}
    </>
  );
}
