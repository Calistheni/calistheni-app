"use client";

import { use, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

let finishNavigation: { pathname: string; pending: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function holdWorkoutLoading(pathname: string) {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const navigation = { pathname, pending };
  finishNavigation = navigation;
  listeners.forEach((listener) => listener());

  return () => {
    if (finishNavigation === navigation) {
      finishNavigation = null;
      listeners.forEach((listener) => listener());
    }
    release();
  };
}

export function WorkoutRouteLoading({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navigation = useSyncExternalStore(subscribe, () => finishNavigation, () => null);

  if (navigation && pathname === navigation.pathname) {
    // Suspending the fallback keeps the committed finish sheet in place during
    // the transition. The detail page can still resolve and commit normally.
    use(navigation.pending);
  }

  return children;
}
