"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function PrimaryTabRevalidator({
  staleAfterMs = 60_000,
}: {
  staleAfterMs?: number;
}) {
  const router = useRouter();
  const lastVisibleAt = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const previousVisibleAt = lastVisibleAt.current;
    lastVisibleAt.current = now;

    if (previousVisibleAt === null || now - previousVisibleAt < staleAfterMs) {
      return;
    }

    const idleWindow = window as IdleWindow;
    const refresh = () => {
      lastVisibleAt.current = Date.now();
      startTransition(() => router.refresh());
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(refresh, {
        timeout: 1_500,
      });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(handle);
  }, [router, staleAfterMs]);

  return null;
}
