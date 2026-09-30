"use client";

import { Activity, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { usePrimaryTabNavigationTarget } from "@/components/navigation/AppShellContext";
import { getPrimaryTabHref, primaryTabNavigation } from "@/lib/navigation";
import {
  isPendingPrimarySurface,
  retainLastResolvedPrimarySurface,
  selectResolvedPrimaryHref,
} from "@/lib/primary-surface-retention";

type PrimaryTabHostProps = {
  children: React.ReactNode;
  home: React.ReactNode;
  nutrition: React.ReactNode;
  parks: React.ReactNode;
  community: React.ReactNode;
  rewards: React.ReactNode;
  profile: React.ReactNode;
};

function RetainedPrimarySurface({ candidate }: { candidate: React.ReactNode }) {
  const pending = isPendingPrimarySurface(candidate);
  const [retention, setRetention] = useState<{
    seen: React.ReactNode;
    resolved: React.ReactNode;
  }>(() => ({ seen: candidate, resolved: pending ? undefined : candidate }));
  let lastResolved = retention.resolved;

  // React's supported "store information from previous renders" pattern lets
  // the current render use a newly resolved surface immediately, while a later
  // pending parallel-route payload keeps the prior resolved node.
  if (retention.seen !== candidate) {
    lastResolved = pending ? retention.resolved : candidate;
    setRetention({ seen: candidate, resolved: lastResolved });
  }

  return retainLastResolvedPrimarySurface(lastResolved, candidate);
}

/**
 * Persistent presentation owner for the six primary application screens.
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
  profile,
}: PrimaryTabHostProps) {
  const pathname = usePathname();
  const navigationTarget = usePrimaryTabNavigationTarget();
  const committedHref = getPrimaryTabHref(pathname);
  const optimisticHref = getPrimaryTabHref(navigationTarget ?? "");
  const surfaces = { home, nutrition, parks, community, rewards, profile };
  const requestedHref = optimisticHref ?? committedHref;
  const requestedEntry = primaryTabNavigation.find(
    ({ href }) => href === requestedHref
  );
  const requestedSurface = requestedEntry ? surfaces[requestedEntry.key] : null;
  const [selection, setSelection] = useState<{
    seenHref: string | null;
    seenSurface: React.ReactNode;
    activeHref: string | null;
  }>(() => ({
    seenHref: requestedHref,
    seenSurface: requestedSurface,
    activeHref: selectResolvedPrimaryHref({
      requestedHref,
      previousHref: null,
      requestedSurface,
    }),
  }));
  let activeHref = selection.activeHref;
  if (
    selection.seenHref !== requestedHref ||
    selection.seenSurface !== requestedSurface
  ) {
    activeHref = selectResolvedPrimaryHref({
      requestedHref,
      previousHref: selection.activeHref,
      requestedSurface,
    });
    setSelection({
      seenHref: requestedHref,
      seenSurface: requestedSurface,
      activeHref,
    });
  }
  const previousHref = useRef(activeHref);
  const scrollPositions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    if (process.env.NODE_ENV !== "production" && activeHref) {
      performance.mark(`calistheni:real-primary-visible:${activeHref}`);
    }
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
            <RetainedPrimarySurface candidate={surfaces[key]} />
          </div>
        </Activity>
      ))}
      {children}
    </div>
  );
}
