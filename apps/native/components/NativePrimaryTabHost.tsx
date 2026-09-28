"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  beginNativeNavigationIntent,
  getNativePrimaryHref,
  nativePersistentDestinations,
  nativePrimaryTabs,
  type NativeNavigationIntent,
  type NativePrimaryHref,
} from "@native/lib/navigation";
import { NativeRewardsSurface } from "./NativeRewardsSurface";
import { NativeHomeSurface } from "./NativeHomeSurface";
import { NativeNutritionSurface } from "./NativeNutritionSurface";
import { NativeCommunitySurface } from "./NativeCommunitySurface";
import { NativeParksSurface } from "./NativeParksSurface";
import { NativeProfileSurface } from "./NativeProfileSurface";
import { useNativeAuth } from "./NativeAuthProvider";
import { recordNativeNavigation } from "@native/lib/runtime-diagnostics";

function NativePersistentSurface({ href, active }: { href: NativePrimaryHref; active: boolean }) {
  if (href === "/home") return <NativeHomeSurface active={active} />;
  if (href === "/nutrition") return <NativeNutritionSurface active={active} />;
  if (href === "/parks") return <NativeParksSurface active={active} />;
  if (href === "/feed") return <NativeCommunitySurface active={active} />;
  if (href === "/rewards") return <NativeRewardsSurface active={active} />;
  return <NativeProfileSurface active={active} />;
}

export function NativePrimaryTabHost() {
  const { state } = useNativeAuth();
  const pathname = usePathname();
  const generationRef = useRef(0);
  const intentRef = useRef<NativeNavigationIntent | null>(null);
  const [intent, setIntent] = useState<NativeNavigationIntent | null>(null);
  const committedHref = getNativePrimaryHref(pathname);
  const activeHref = intent?.href ?? committedHref;

  function beginIntent(href: NativePrimaryHref) {
    if (intentRef.current?.href === href) return intentRef.current;
    const next = beginNativeNavigationIntent(generationRef.current, href);
    generationRef.current = next.generation;
    intentRef.current = next;
    setIntent(next);
    return next;
  }

  function activateDestination(href: NativePrimaryHref, active: boolean) {
    if (active) return;
    const hrefBefore = window.location.href;
    const pathnameBefore = window.location.pathname;
    const next = beginIntent(href);
    if (!next) return;
    window.history.pushState({ ...window.history.state, calistheniPrimary: href }, "", href);
    recordNativeNavigation({
      from: activeHref,
      requested: href,
      activeSurfaceBefore: activeHref,
      activeSurfaceAfter: href,
      pathnameBefore,
      pathnameAfter: window.location.pathname,
      hrefBefore,
      hrefAfter: window.location.href,
      generation: next.generation,
    });
  }

  useEffect(() => {
    if (!intent || committedHref !== intent.href) return;
    const settledGeneration = intent.generation;
    const frame = window.requestAnimationFrame(() => {
      setIntent((current) =>
        current?.generation === settledGeneration ? (intentRef.current = null) : current
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [committedHref, intent]);

  useEffect(() => {
    const handleHistoryTraversal = () => {
      generationRef.current += 1;
      intentRef.current = null;
      setIntent(null);
    };

    window.addEventListener("popstate", handleHistoryTraversal);
    return () => window.removeEventListener("popstate", handleHistoryTraversal);
  }, []);

  return (
    <>
      <main className="native-surface-viewport" data-native-primary-tab-host>
        {nativePersistentDestinations.map(({ href }) => {
          const active = activeHref === href;
          return (
            <section
              key={href}
              className="native-surface"
              data-native-surface={href}
              hidden={!active}
              aria-hidden={!active || undefined}
            >
              <NativePersistentSurface href={href} active={active} />
            </section>
          );
        })}
      </main>

      {state.status === "authenticated" && activeHref !== "/profile" ? (
        <button
          type="button"
          className="native-profile-link"
          aria-label="Open profile"
          onClick={() => activateDestination("/profile", false)}
        >
          {state.bootstrap.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.bootstrap.user.image} alt="" />
          ) : (state.bootstrap.user.name ?? "U").slice(0, 1)}
        </button>
      ) : null}

      <nav className="native-bottom-navigation" aria-label="Primary navigation">
        {nativePrimaryTabs.map(({ href, label, symbol }) => {
          const active = activeHref === href;
          return (
            <button
              type="button"
              key={href}
              aria-current={active ? "page" : undefined}
              className="native-tab"
              data-active={active || undefined}
              onClick={() => activateDestination(href, active)}
            >
              <span className="native-tab-symbol" aria-hidden="true">{symbol}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
