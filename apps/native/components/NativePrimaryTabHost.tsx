"use client";

import Link from "next/link";
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
    if (intentRef.current?.href === href) return;
    const next = beginNativeNavigationIntent(generationRef.current, href);
    generationRef.current = next.generation;
    intentRef.current = next;
    setIntent(next);
  }

  function activateDestination(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: NativePrimaryHref,
    active: boolean
  ) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (active) {
      event.preventDefault();
      return;
    }
    beginIntent(href);
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
        <Link
          href="/profile"
          scroll={false}
          className="native-profile-link"
          aria-label="Open profile"
          onClick={(event) => activateDestination(event, "/profile", false)}
        >
          {state.bootstrap.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.bootstrap.user.image} alt="" />
          ) : (state.bootstrap.user.name ?? "U").slice(0, 1)}
        </Link>
      ) : null}

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
              onClick={(event) => activateDestination(event, href, active)}
            >
              <span className="native-tab-symbol" aria-hidden="true">{symbol}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
