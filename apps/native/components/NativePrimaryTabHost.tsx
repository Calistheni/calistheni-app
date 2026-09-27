"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  beginNativeNavigationIntent,
  getNativePrimaryHref,
  nativePrimaryTabs,
  type NativeNavigationIntent,
  type NativePrimaryHref,
} from "@native/lib/navigation";
import { NativeRewardsSurface } from "./NativeRewardsSurface";
import { NativeHomeSurface } from "./NativeHomeSurface";
import { NativeNutritionSurface } from "./NativeNutritionSurface";
import { NativeCommunitySurface } from "./NativeCommunitySurface";
import { NativeParksSurface } from "./NativeParksSurface";
import { useNativeAuth } from "./NativeAuthProvider";

const surfaceCopy: Record<
  NativePrimaryHref,
  { eyebrow: string; title: string; description: string }
> = {
  "/home": {
    eyebrow: "Local application shell",
    title: "Bundled native Home",
    description: "This Home surface is rendered from files inside the iOS application.",
  },
  "/nutrition": {
    eyebrow: "Local application shell",
    title: "Bundled native Nutrition",
    description: "Nutrition exists locally before any future data request begins.",
  },
  "/parks": {
    eyebrow: "Local application shell",
    title: "Bundled native Parks",
    description: "The Parks shell does not wait for Mapbox or a remote server.",
  },
  "/feed": {
    eyebrow: "Local application shell",
    title: "Bundled native Community",
    description: "The Community surface is available without a feed response.",
  },
  "/rewards": {
    eyebrow: "Local application shell",
    title: "Bundled native Rewards",
    description: "The Rewards structure is part of the local application bundle.",
  },
};

export function NativePrimaryTabHost() {
  const { state, logout } = useNativeAuth();
  const pathname = usePathname();
  const generationRef = useRef(0);
  const pointerIntentRef = useRef<NativePrimaryHref | null>(null);
  const [intent, setIntent] = useState<NativeNavigationIntent | null>(null);
  const committedHref = getNativePrimaryHref(pathname);
  const activeHref = intent?.href ?? committedHref;

  function beginIntent(href: NativePrimaryHref) {
    if (intent?.href === href) return;
    const next = beginNativeNavigationIntent(generationRef.current, href);
    generationRef.current = next.generation;
    setIntent(next);
  }

  useEffect(() => {
    if (!intent || committedHref !== intent.href) return;
    const settledGeneration = intent.generation;
    const frame = window.requestAnimationFrame(() => {
      setIntent((current) =>
        current?.generation === settledGeneration ? null : current
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [committedHref, intent]);

  useEffect(() => {
    const handleHistoryTraversal = () => {
      generationRef.current += 1;
      pointerIntentRef.current = null;
      setIntent(null);
    };

    window.addEventListener("popstate", handleHistoryTraversal);
    return () => window.removeEventListener("popstate", handleHistoryTraversal);
  }, []);

  return (
    <>
      <main className="native-surface-viewport" data-native-primary-tab-host>
        {nativePrimaryTabs.map(({ href, label }) => {
          const active = activeHref === href;
          const copy = surfaceCopy[href];
          return (
            <section
              key={href}
              className="native-surface"
              data-native-surface={href}
              hidden={!active}
              aria-hidden={!active || undefined}
            >
              {href === "/home" ? <NativeHomeSurface active={active} /> : href === "/nutrition" ? <NativeNutritionSurface active={active} /> : href === "/parks" ? <NativeParksSurface active={active} /> : href === "/feed" ? <NativeCommunitySurface active={active} /> : href === "/rewards" ? <NativeRewardsSurface active={active} /> : <div className="native-surface-card">
                <p className="native-eyebrow">{copy.eyebrow}</p>
                <h1>{copy.title}</h1>
                <p className="native-description">{copy.description}</p>
                <div className="native-proof" role="status">
                  <span aria-hidden="true" />
                  <div>
                    <strong>{label} is local</strong>
                    <p>No authentication, API, RSC network response, or loading UI is required.</p>
                  </div>
                </div>
              </div>}
            </section>
          );
        })}
      </main>

      <nav className="native-bottom-navigation" aria-label="Primary navigation">
        {nativePrimaryTabs.map(({ href, label, symbol }) => {
          const active = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className="native-tab"
              data-active={active || undefined}
              onPointerDown={(event) => {
                if (
                  active ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                pointerIntentRef.current = href;
                beginIntent(href);
              }}
              onPointerCancel={() => {
                if (pointerIntentRef.current !== href) return;
                generationRef.current += 1;
                pointerIntentRef.current = null;
                setIntent(null);
              }}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }

                const beganOnPointerDown = pointerIntentRef.current === href;
                pointerIntentRef.current = null;
                if (active && !beganOnPointerDown) {
                  event.preventDefault();
                  return;
                }
                if (!beganOnPointerDown) beginIntent(href);
              }}
            >
              <span className="native-tab-symbol" aria-hidden="true">{symbol}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      {state.status === "authenticated" ? <button className="native-logout" onClick={() => void logout()} aria-label="Sign out">Sign out</button> : null}
    </>
  );
}
